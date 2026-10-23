import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/src/api";
import { AccentCard, Fab, useFabListPadding } from "@/src/components/Brand";
import { Header } from "@/src/components/Header";
import { SentLetters } from "@/src/components/SentLetters";
import { StatusPill } from "@/src/components/StatusPill";
import { useAuth } from "@/src/auth";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

export type Case = { case_id: string; title: string; description: string; sector: string; status: string; updated_at: string; created_at: string };

export default function Cases() {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const { locale } = useAuth();
  const listPad = useFabListPadding();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setCases(await api<Case[]>("/cases"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.root} testID="cases-screen">
      <Header robot="sprawy" title={t("casesTitle")} subtitle={t("casesSub", { n: String(cases.filter((c) => c.status === "open").length) })} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimaryText} testID="cases-loading" /></View>
      ) : error ? (
        <View style={styles.center} testID="cases-error">
          <Text style={styles.muted}>{t("loadError")}</Text>
          <Pressable testID="cases-retry-button" onPress={load} style={styles.retry}><Text style={styles.retryText}>{t("retry")}</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={cases}
          keyExtractor={(c) => c.case_id}
          contentContainerStyle={[styles.list, { paddingBottom: listPad }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimaryText} />}
          ListHeaderComponent={<SentLetters />}
          ListEmptyComponent={
            <View style={styles.empty} testID="cases-empty">
              <Ionicons name="folder-open-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyTitle}>{t("noCases")}</Text>
              <Text style={styles.muted}>{t("noCasesSub")}</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 60).duration(300)}>
              <AccentCard
                testID={`case-card-${item.case_id}`}
                onPress={() => router.push({ pathname: "/chat/[threadId]", params: { threadId: item.case_id, title: item.title } })}
                onLongPress={() => router.push(`/case/${item.case_id}`)}
              >
                <View style={styles.cardTop}>
                  <StatusPill status={item.status} />
                  <Text style={styles.date} numberOfLines={1}>{formatDate(item.updated_at, locale)}</Text>
                </View>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
                {!!item.sector && (
                  <View style={styles.sector}>
                    <Ionicons name="business-outline" size={14} color={colors.muted} />
                    <Text style={styles.sectorText} numberOfLines={1}>{item.sector}</Text>
                  </View>
                )}
              </AccentCard>
            </Animated.View>
          )}
        />
      )}
      <Fab testID="new-case-fab" icon="add" label={t("newCase")} onPress={() => router.push("/new-case")} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { color: c.muted, fontSize: 14, textAlign: "center" },
  retry: { backgroundColor: c.brandPrimary, paddingHorizontal: 20, height: 44, borderRadius: 12, justifyContent: "center" },
  retryText: { color: c.onBrandPrimary, fontWeight: "700" },
  list: { padding: 16, gap: 12 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  date: { color: c.muted, fontSize: 12, flexShrink: 0 },
  title: { color: c.onSurface, fontSize: 17, fontWeight: "800" },
  desc: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  sector: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectorText: { color: c.muted, fontSize: 12, fontWeight: "600", flex: 1 },
  empty: { alignItems: "center", gap: 8, paddingTop: 64 },
  emptyTitle: { color: c.onSurface, fontSize: 17, fontWeight: "700" },
}));
