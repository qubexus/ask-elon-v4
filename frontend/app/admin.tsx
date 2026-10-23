import Ionicons from "@react-native-vector-icons/ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";

type Tab = "dash" | "users" | "promos" | "broadcast" | "inbox";
const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "dash", label: "Dashboard", icon: "stats-chart" },
  { id: "users", label: "Użytkownicy", icon: "people" },
  { id: "promos", label: "Promocje", icon: "pricetags" },
  { id: "broadcast", label: "Broadcast", icon: "megaphone" },
  { id: "inbox", label: "Wiadomości", icon: "mail" },
];

export default function Admin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("dash");
  const [loaded, setLoaded] = useState<{ tab: Tab; data: any } | null>(null);
  const data = loaded?.tab === tab ? loaded.data : null;
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const path: Record<Tab, string> = { dash: "/admin/stats", users: "/admin/users", promos: "/admin/promos", broadcast: "/admin/broadcasts", inbox: "/admin/contact-messages" };
  const load = useCallback(async () => {
    try {
      const res = await api(path[tab]);
      setLoaded({ tab, data: tab === "dash" ? res ?? {} : Array.isArray(res) ? res : [] });
    } catch (e: any) {
      toast(e.message, "error");
      setLoaded({ tab, data: tab === "dash" ? {} : [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
      setF({});
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const input = (k: string, ph: string, extra: any = {}) => (
    <TextInput testID={`admin-${k}-input`} value={f[k] ?? ""} onChangeText={set(k)} placeholder={ph} placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" {...extra} />
  );
  const btn = (id: string, label: string, onPress: () => void, danger = false) => (
    <Pressable testID={id} onPress={onPress} style={[styles.btn, danger && styles.btnDanger]}>
      <Text style={[styles.btnText, danger && { color: colors.error }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root} testID="admin-screen">
      <Header back title="Hub Administratora" subtitle="Ask Elon · Admin" />
      <View style={styles.tabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((x) => (
            <Pressable key={x.id} testID={`admin-tab-${x.id}`} onPress={() => setTab(x.id)} style={[styles.chip, tab === x.id && styles.chipOn]}>
              <Ionicons name={x.icon} size={14} color={tab === x.id ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
              <Text style={[styles.chipText, tab === x.id && { color: colors.onBrandPrimary }]}>{x.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {!data ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : tab === "dash" ? (
          <View style={styles.grid} testID="admin-stats">
            {[
              ["Przychód MRR", `£${data.mrr_gbp}`],
              ["Aktywne subskrypcje", data.active_subscriptions],
              ["Użytkownicy", data.users],
              ["Członkowie PRO", data.members],
              ["Sprawy", data.cases],
              ["Wiadomości czatu", data.messages],
              ["Dokumenty", data.documents],
              ["Posty forum", data.forum_posts],
              ["Nowe zgłoszenia", data.unread_contact],
            ].map(([l, v]) => (
              <View key={l as string} style={styles.stat}>
                <Text style={styles.statVal}>{v as any}</Text>
                <Text style={styles.statLbl}>{l as string}</Text>
              </View>
            ))}
          </View>
        ) : tab === "users" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Dodaj użytkownika</Text>
              {input("name", "Imię i nazwisko")}
              {input("email", "E-mail", { keyboardType: "email-address" })}
              {input("password", "Hasło (min. 8)", { secureTextEntry: true })}
              {btn("admin-add-user", "Dodaj", () => act(() => api("/admin/users", { method: "POST", body: { name: f.name ?? "", email: f.email ?? "", password: f.password ?? "" } }), "Dodano"))}
            </View>
            {(data as any[]).map((u) => (
              <View key={u.user_id} style={styles.card} testID={`admin-user-${u.user_id}`}>
                <Text style={styles.cardTitle}>{u.name || "—"} {u.role === "admin" ? "· ADMIN" : ""}</Text>
                <Text style={styles.muted}>{u.email} · {u.is_member ? "PRO" : "Free"} · {u.profile_complete ? "profil ✓" : "profil niepełny"}</Text>
                <TextInput testID={`admin-rename-${u.user_id}`} defaultValue={u.name} onEndEditing={(e) => e.nativeEvent.text !== u.name && act(() => api(`/admin/users/${u.user_id}`, { method: "PATCH", body: { name: e.nativeEvent.text } }), "Zapisano")} style={styles.input} placeholder="Imię" placeholderTextColor={colors.muted} />
                <View style={styles.row}>
                  {btn(`admin-toggle-pro-${u.user_id}`, u.is_member ? "Odbierz PRO" : "Nadaj PRO", () => act(() => api(`/admin/users/${u.user_id}`, { method: "PATCH", body: { is_member: !u.is_member } })))}
                  {btn(`admin-toggle-admin-${u.user_id}`, u.role === "admin" ? "Usuń admina" : "Nadaj admina", () => act(() => api(`/admin/users/${u.user_id}`, { method: "PATCH", body: { role: u.role === "admin" ? "user" : "admin" } })))}
                  {btn(`admin-delete-${u.user_id}`, "Usuń", () => act(() => api(`/admin/users/${u.user_id}`, { method: "DELETE" }), "Usunięto"), true)}
                </View>
              </View>
            ))}
          </>
        ) : tab === "promos" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Nowy kod promocyjny</Text>
              {input("code", "KOD (np. START50)", { autoCapitalize: "characters" })}
              {input("description", "Opis akcji")}
              {input("discount", "Rabat %", { keyboardType: "number-pad" })}
              {btn("admin-add-promo", "Dodaj kod", () => act(() => api("/admin/promos", { method: "POST", body: { code: f.code ?? "", description: f.description ?? "", discount_percent: parseInt(f.discount || "0", 10) } }), "Dodano kod"))}
            </View>
            {(data as any[]).map((p) => (
              <View key={p.code} style={styles.card} testID={`admin-promo-${p.code}`}>
                <Text style={styles.cardTitle}>{p.code} · -{p.discount_percent}% {p.active ? "" : "(nieaktywny)"}</Text>
                <Text style={styles.muted}>{p.description}</Text>
                <View style={styles.row}>
                  {btn(`admin-promo-toggle-${p.code}`, p.active ? "Wyłącz" : "Włącz", () => act(() => api(`/admin/promos/${p.code}`, { method: "PATCH" })))}
                  {btn(`admin-promo-delete-${p.code}`, "Usuń", () => act(() => api(`/admin/promos/${p.code}`, { method: "DELETE" })), true)}
                </View>
              </View>
            ))}
          </>
        ) : tab === "broadcast" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Wiadomość do wszystkich użytkowników</Text>
              <Text style={styles.muted}>Pojawi się jednorazowo w głównym czacie każdego użytkownika z oznaczeniem systemowym.</Text>
              {input("text", "Treść komunikatu…", { multiline: true, style: [styles.input, { minHeight: 100, textAlignVertical: "top" }] })}
              {btn("admin-send-broadcast", "Wyślij broadcast", () => act(() => api("/admin/broadcast", { method: "POST", body: { text: f.text ?? "" } }), "Wysłano"))}
            </View>
            {(data as any[]).map((b) => (
              <View key={b.broadcast_id} style={styles.card}>
                <Text style={styles.muted}>{new Date(b.created_at).toLocaleString()} · {b.author}</Text>
                <Text style={styles.text}>{b.text}</Text>
              </View>
            ))}
          </>
        ) : (
          (data as any[]).length === 0 ? <Text style={styles.muted}>Brak wiadomości</Text> :
          (data as any[]).map((m) => (
            <View key={m.msg_id} style={[styles.card, !m.read && styles.unread]} testID={`admin-message-${m.msg_id}`}>
              <Text style={styles.cardTitle}>{m.read ? "" : "● "}{m.subject}</Text>
              <Text style={styles.muted}>{m.name} · {m.email} · {new Date(m.created_at).toLocaleString()}</Text>
              <Text style={styles.text}>{m.body}</Text>
              <View style={styles.row}>
                {!m.read && btn(`admin-message-read-${m.msg_id}`, "Oznacz jako przeczytane", () => act(() => api(`/admin/contact-messages/${m.msg_id}`, { method: "PATCH" })))}
                {btn(`admin-message-delete-${m.msg_id}`, "Usuń", () => act(() => api(`/admin/contact-messages/${m.msg_id}`, { method: "DELETE" })), true)}
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  tabRow: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: c.divider },
  tabs: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 12, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, flexShrink: 0 },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 13 },
  body: { padding: 16, gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: { width: "48%", flexGrow: 1, backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
  statVal: { color: c.brandPrimary, fontSize: 24, fontWeight: "900" },
  statLbl: { color: c.muted, fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
  unread: { borderColor: c.brandPrimary },
  cardTitle: { color: c.onSurface, fontWeight: "800", fontSize: 14 },
  muted: { color: c.muted, fontSize: 12 },
  text: { color: c.onSurface, fontSize: 14, lineHeight: 20 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 44, fontSize: 14, color: c.onSurface },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.brandPrimary, justifyContent: "center" },
  btnDanger: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.error },
  btnText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 12 },
}));
