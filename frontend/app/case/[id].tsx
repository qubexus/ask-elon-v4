import Ionicons from "@react-native-vector-icons/ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Header } from "@/src/components/Header";
import { StatusPill } from "@/src/components/StatusPill";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/auth";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";
import type { Case } from "../(tabs)/cases";

export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { locale } = useAuth();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<Case | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setC(await api<Case>(`/cases/${id}`));
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async () => {
    if (!c) return;
    setBusy(true);
    try {
      setC(await api<Case>(`/cases/${id}`, { method: "PATCH", body: { status: c.status === "open" ? "resolved" : "open" } }));
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="case-detail-screen">
      <Header back title={c?.title ?? ""} />
      {error ? (
        <View style={styles.center} testID="case-detail-error">
          <Text style={styles.muted}>{t("loadError")}</Text>
          <Pressable testID="case-retry-button" onPress={load} style={styles.secondary}><Text style={styles.secondaryText}>{t("retry")}</Text></Pressable>
        </View>
      ) : !c ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimaryText} /></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.meta}>
              <StatusPill status={c.status} />
              <Text style={styles.muted}>{t("updated")}: {formatDate(c.updated_at, locale)}</Text>
            </View>
            <Text style={styles.title} testID="case-detail-title">{c.title}</Text>
            {!!c.sector && (
              <View style={styles.sector}>
                <Ionicons name="business-outline" size={16} color={colors.brandPrimaryText} />
                <Text style={styles.sectorText}>{c.sector}</Text>
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.label}>{t("caseDesc")}</Text>
              <Text style={styles.desc} testID="case-detail-description">{c.description}</Text>
            </View>
            <Pressable testID="case-toggle-status-button" onPress={toggle} disabled={busy} style={styles.secondary}>
              {busy ? <ActivityIndicator color={colors.brandPrimaryText} /> : (
                <Text style={styles.secondaryText}>{c.status === "open" ? t("markResolved") : t("reopen")}</Text>
              )}
            </Pressable>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              testID="case-ask-elon-button"
              onPress={() => router.push({ pathname: "/chat/[threadId]", params: { threadId: c.case_id, title: c.title } })}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="chatbubbles" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.ctaText}>{t("askElon")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: c.muted, fontSize: 13 },
  body: { padding: 16, gap: 16 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: c.onSurface, fontSize: 24, fontWeight: "900", lineHeight: 30 },
  sector: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectorText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: c.border },
  label: { color: c.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  desc: { color: c.onSurface, fontSize: 15, lineHeight: 23 },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.brandPrimaryBorder, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  secondaryText: { color: c.brandPrimaryText, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border },
  cta: { minHeight: 52, borderRadius: 12, backgroundColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, ...fx("buttonShadow") },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 15 },
}));
