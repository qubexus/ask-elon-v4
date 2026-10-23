import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Doc, openAuditLetter } from "@/src/components/DocumentsPanel";
import { Header } from "@/src/components/Header";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

const gbp = (n: number) => `£${n.toFixed(2)}`;

export default function Audits() {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api<Doc[]>("/documents");
      setDocs(all.filter((d) => d.category === "payslip" && d.audit));
    } catch {
      setDocs((d) => d ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const total = docs?.reduce((s, d) => s + (Number(d.audit?.estimated_owed_gbp) || 0), 0) ?? 0;
  const hours = docs?.reduce((s, d) => s + (Number(d.audit?.unpaid_hours) || 0), 0) ?? 0;
  const bad = docs?.filter((d) => d.audit?.verdict === "issues").length ?? 0;

  return (
    <View style={styles.root} testID="audits-screen">
      <Header back title={t("auditHistory")} subtitle="ask Elon · PRO" />
      {!docs ? (
        <ActivityIndicator color={colors.brandPrimaryText} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          <View style={styles.hero} testID="audits-total-card">
            <Text style={styles.heroLbl}>{t("auditTotal")}</Text>
            <Text style={styles.heroVal} testID="audits-total-owed">{gbp(total)}</Text>
            <View style={styles.heroRow}>
              <View style={styles.heroStat}><Text style={styles.heroStatVal} testID="audits-total-hours">{hours}</Text><Text style={styles.heroStatLbl}>{t("auditTotalHours")}</Text></View>
              <View style={styles.heroStat}><Text style={styles.heroStatVal}>{docs.length}</Text><Text style={styles.heroStatLbl}>{t("auditChecked")}</Text></View>
              <View style={styles.heroStat}><Text style={styles.heroStatVal}>{bad}</Text><Text style={styles.heroStatLbl}>{t("auditWithIssues")}</Text></View>
            </View>
            {total > 0 && (
              <Pressable testID="audits-letter-button" onPress={() => openAuditLetter(docs)} style={styles.heroCta}>
                <Ionicons name="mail-outline" size={16} color={colors.onBrandPrimary} />
                <Text style={styles.heroCtaText}>{t("auditLetter")}</Text>
              </Pressable>
            )}
          </View>

          {docs.length > 0 && <MonthlyChart docs={docs} />}

          {docs.length === 0 ? (
            <View style={styles.empty} testID="audits-empty">
              <Ionicons name="receipt-outline" size={32} color={colors.muted} />
              <Text style={styles.emptyText}>{t("auditNone")}</Text>
              <Pressable testID="audits-go-docs" onPress={() => router.push("/profile?tab=docs")} style={styles.secondary}>
                <Text style={styles.secondaryText}>{t("auditGoDocs")}</Text>
              </Pressable>
            </View>
          ) : (
            docs.map((d, i) => {
              const a = d.audit!;
              const issues = a.verdict === "issues";
              return (
                <Animated.View key={d.doc_id} entering={FadeInDown.delay(i * 50).duration(260)}>
                  <Pressable testID={`audit-row-${d.doc_id}`} onPress={() => router.push("/profile?tab=docs")} style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}>
                    <View style={[styles.dot, { backgroundColor: issues ? colors.error : colors.success }]} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{a.pay_period || d.title || d.filename}</Text>
                      <Text style={styles.rowSub} numberOfLines={2}>{a.summary}</Text>
                      <Text style={[styles.rowTag, { color: issues ? colors.error : colors.success }]}>{issues ? t("auditIssues") : t("auditOk")}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={styles.rowOwed}>{gbp(Number(a.estimated_owed_gbp) || 0)}</Text>
                      <Text style={styles.rowSub}>{Number(a.unpaid_hours) || 0} h</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const monthOf = (d: Doc) => (/^\d{4}-\d{2}$/.test(d.audit?.pay_month ?? "") ? d.audit!.pay_month! : d.created_at.slice(0, 7));

function MonthlyChart({ docs }: { docs: Doc[] }) {
  const t = useT();
  const styles = useStyles();
  const sums: Record<string, number> = {};
  for (const d of docs) sums[monthOf(d)] = (sums[monthOf(d)] ?? 0) + (Number(d.audit?.estimated_owed_gbp) || 0);
  const keys = Object.keys(sums).sort();
  // Continuous month range (max 12) ending at the latest audited month.
  const months: string[] = [];
  let [y, m] = keys[keys.length - 1].split("-").map(Number);
  const first = keys[0];
  while (months.length < 12) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    months.unshift(k);
    if (k <= first) break;
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  const max = Math.max(...months.map((k) => sums[k] ?? 0));
  return (
    <View style={styles.chartCard} testID="audits-monthly-chart">
      <Text style={styles.chartTitle}>{t("auditChart")}</Text>
      {max <= 0 ? (
        <Text style={styles.rowSub}>{t("auditChartEmpty")}</Text>
      ) : (
        <View style={styles.chart}>
          {months.map((k) => {
            const v = sums[k] ?? 0;
            return (
              <View key={k} style={styles.barCol} testID={`audits-bar-${k}`}>
                <Text style={styles.barVal} numberOfLines={1}>{v > 0 ? `£${Math.round(v)}` : ""}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%` }]} />
                </View>
                <Text style={styles.barLbl}>{k.slice(5)}/{k.slice(2, 4)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  chartCard: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  chartTitle: { color: c.onSurface, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 160 },
  barCol: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  barVal: { color: c.onSurfaceTertiary, fontSize: 9, fontWeight: "700" },
  barTrack: { flex: 1, width: "100%", maxWidth: 28, justifyContent: "flex-end", backgroundColor: c.surfaceTertiary, borderRadius: 6, overflow: "hidden" },
  bar: { width: "100%", backgroundColor: c.brandPrimary, borderRadius: 6 },
  barLbl: { color: c.muted, fontSize: 10, fontWeight: "600" },
  root: { flex: 1, backgroundColor: c.surface },
  body: { padding: 16, gap: 12 },
  hero: { backgroundColor: c.brand, borderRadius: 18, padding: 18, gap: 8 },
  heroLbl: { color: c.onBrand, opacity: 0.75, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  heroVal: { color: c.onBrand, fontSize: 38, fontWeight: "900" },
  heroRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  heroStat: { flex: 1, backgroundColor: c.brandTertiary, borderRadius: 12, padding: 10 },
  heroStatVal: { color: c.onBrandTertiary, fontSize: 18, fontWeight: "900" },
  heroStatLbl: { color: c.onBrandTertiary, opacity: 0.8, fontSize: 11, fontWeight: "600" },
  heroCta: { marginTop: 8, minHeight: 46, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  heroCtaText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 13, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { color: c.onSurface, fontWeight: "800", fontSize: 15 },
  rowSub: { color: c.muted, fontSize: 12 },
  rowTag: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  rowOwed: { color: c.onSurface, fontWeight: "900", fontSize: 16 },
  empty: { alignItems: "center", gap: 10, padding: 24 },
  emptyText: { color: c.muted, textAlign: "center", fontSize: 14 },
  secondary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  secondaryText: { color: c.brandPrimaryText, fontWeight: "700" },
}));
