import Ionicons from "@react-native-vector-icons/ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { useRefreshUnread } from "@/src/inbox";
import { makeStyles, useTheme } from "@/src/theme";

type Msg = { id: string; title: string; body: string; link?: string | null; created_at: string; read: boolean };

function useDateLabel() {
  const t = useT();
  const { locale } = useAuth();
  return (iso: string) => {
    const d = new Date(iso);
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff === 0) return `${t("msgToday")}, ${time}`;
    if (diff === 1) return `${t("msgYesterday")}, ${time}`;
    return formatDate(d, locale);
  };
}

export default function Messages() {
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const refreshUnread = useRefreshUnread();
  const dateLabel = useDateLabel();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setMsgs(await api<Msg[]>("/messages?limit=50&offset=0"));
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const unread = msgs?.filter((m) => !m.read).length ?? 0;

  const toggle = async (m: Msg) => {
    setOpen((o) => (o === m.id ? null : m.id));
    if (m.read) return;
    setMsgs((list) => list?.map((x) => (x.id === m.id ? { ...x, read: true } : x)) ?? null);
    try {
      await api(`/messages/${m.id}/read`, { method: "POST" });
    } catch (e: any) {
      toast(e.message, "error");
    }
    refreshUnread();
  };

  const markAll = async () => {
    setMsgs((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
    try {
      await api("/messages/read-all", { method: "POST" });
    } catch (e: any) {
      toast(e.message, "error");
    }
    refreshUnread();
  };

  return (
    <View style={styles.root} testID="messages-screen">
      <Header back title={t("msgTitle")} subtitle={t("msgSubtitle")} />
      {error ? (
        <View style={styles.empty} testID="messages-error">
          <Ionicons name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>{t("msgError")}</Text>
          <Pressable testID="messages-retry" onPress={load} style={styles.retry}><Text style={styles.retryText}>{t("msgRetry")}</Text></Pressable>
        </View>
      ) : !msgs ? (
        <ActivityIndicator color={colors.askOrange} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }, msgs.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); refreshUnread(); setRefreshing(false); }} />}
          ListHeaderComponent={
            msgs.length > 0 ? (
              <View style={styles.bar}>
                <Text style={styles.barText} testID="messages-unread-label">{t("msgUnread", { n: String(unread) })}</Text>
                {unread > 0 && (
                  <Pressable testID="messages-mark-all" onPress={markAll} hitSlop={8}>
                    <Text style={styles.markAll}>{t("msgMarkAll")}</Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty} testID="messages-empty">
              <Ionicons name="mail-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>{t("msgEmptyTitle")}</Text>
              <Text style={styles.emptyText}>{t("msgEmptyText")}</Text>
            </View>
          }
          renderItem={({ item: m }) => {
            const expanded = open === m.id;
            return (
              <Pressable testID={`message-item-${m.id}`} onPress={() => toggle(m)} style={[styles.item, !m.read && styles.itemUnread]}>
                <View style={[styles.dot, m.read ? styles.dotRead : styles.dotUnread]} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.title, !m.read && styles.titleUnread]}>{m.title}</Text>
                  <Text style={styles.body} numberOfLines={expanded ? undefined : 3}>{m.body}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.date}>{dateLabel(m.created_at)}</Text>
                    {!!m.link && (
                      <Pressable testID={`message-link-${m.id}`} onPress={() => Linking.openURL(m.link!)} hitSlop={8}>
                        <Text style={styles.link}>{t("msgOpenLink")}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  list: { padding: 16, gap: 10 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  barText: { color: c.askNavy, fontWeight: "800", fontSize: 13 },
  markAll: { color: c.askOrange, fontWeight: "700", fontSize: 13 },
  item: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.askField, borderWidth: 1, borderColor: c.askBorder },
  itemUnread: { backgroundColor: c.askBgBottom, borderColor: c.askOrangeTint },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  dotUnread: { backgroundColor: c.askOrange },
  dotRead: { borderWidth: 1.5, borderColor: c.muted },
  title: { color: c.askInk, fontSize: 15, fontWeight: "500" },
  titleUnread: { fontWeight: "800" },
  body: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 },
  date: { color: c.muted, fontSize: 12 },
  link: { color: c.askOrange, fontWeight: "700", fontSize: 13 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  emptyTitle: { color: c.askNavy, fontSize: 17, fontWeight: "800" },
  emptyText: { color: c.muted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  retry: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.askOrange, justifyContent: "center" },
  retryText: { color: c.onAccent, fontWeight: "800" },
}));
