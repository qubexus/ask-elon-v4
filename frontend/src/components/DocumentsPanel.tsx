import Ionicons from "@react-native-vector-icons/ionicons";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api, API_BASE, getApiToken } from "@/src/api";
import { ScanFlow } from "@/src/components/ScanFlow";
import { usePro } from "@/src/revenuecat";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

export type Doc = {
  doc_id: string;
  filename: string;
  mime: string;
  size: number;
  has_thumb: boolean;
  /** signed thumbnail link (relative to /api), valid a few minutes */
  thumb_url?: string | null;
  status: "processing" | "ready" | "failed";
  category: string;
  title?: string;
  summary?: string;
  tags?: string[];
  created_at: string;
  audit_status?: "running" | "done" | "failed";
  audit?: {
    verdict: "ok" | "issues";
    summary: string;
    pay_period?: string;
    pay_month?: string;
    unpaid_hours?: number;
    estimated_owed_gbp?: number;
    compared_with_contract?: boolean;
    issues: { title: string; detail: string; amount_gbp?: number | null; severity: string }[];
  };
};

type Asset = { uri: string; name: string; type: string; file?: Blob };

const CATS = ["", "contract", "annex", "policy", "correspondence", "payslip"] as const;
const MAX = 20 * 1024 * 1024;
// Files open through short-lived signed links from the server (no session token in any URL).
const absolute = (path: string) => `${API_BASE}${path}`;

export function DocumentsPanel() {
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [cat, setCat] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const isPro = usePro();

  const load = useCallback(async () => {
    try {
      setDocs(await api<Doc[]>("/documents"));
    } catch {
      setDocs((d) => d ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the AI engine is processing any file.
  const processing = docs?.some((d) => d.status === "processing" || d.audit_status === "running");
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [processing, load]);

  const hasContract = docs?.some((d) => d.category === "contract" && d.status !== "failed");
  const catLabel = (c: string) => (c ? t(`cat_${c}` as any) : t("catAuto"));

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/png", "image/jpeg"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > MAX) {
      toast(t("fileTooBig"), "error");
      return;
    }
    const name = a.name || "document";
    await upload({ uri: a.uri, name, type: a.mimeType || (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"), file: a.file });
  };

  const reaudit = async (id: string) => {
    try {
      await api(`/documents/${id}/audit`, { method: "POST" });
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const upload = async (a: Asset) => {
    setUploading(true);
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = a.file ?? (await (await fetch(a.uri)).blob());
        form.append("file", blob as any, a.name);
      } else {
        form.append("file", { uri: a.uri, name: a.name, type: a.type } as any);
      }
      form.append("category", cat);
      const r = await fetch(`${API_BASE}/documents`, { method: "POST", headers: { Authorization: `Bearer ${getApiToken()}` }, body: form });
      if (!r.ok) {
        let msg = `Error ${r.status}`;
        try {
          msg = (await r.json()).detail ?? msg;
        } catch {}
        throw new Error(msg);
      }
      toast(t("docUploaded"));
      setCat("");
      await load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api(`/documents/${id}`, { method: "DELETE" });
      setDocs((d) => d?.filter((x) => x.doc_id !== id) ?? null);
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const retry = async (id: string) => {
    await api(`/documents/${id}/reprocess`, { method: "POST" });
    load();
  };

  const open = async (d: Doc) => {
    // web: open the tab inside the tap (popup blockers), then point it at a fresh signed link
    const tab = Platform.OS === "web" ? window.open("about:blank", "_blank") : null;
    try {
      const { url } = await api<{ url: string }>(`/documents/${d.doc_id}/link?kind=file`);
      if (Platform.OS !== "web") await WebBrowser.openBrowserAsync(absolute(url));
      else if (tab) tab.location.href = absolute(url);
      else window.location.assign(absolute(url));
    } catch (e: any) {
      tab?.close();
      toast(e.message, "error");
    }
  };

  return (
    <View style={styles.wrap} testID="documents-panel">
      {docs && !hasContract && (
        <View style={styles.reqBanner} testID="documents-contract-required">
          <Ionicons name="alert-circle" size={20} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reqTitle}>{t("contractRequired")}</Text>
            <Text style={styles.reqSub}>{t("contractRequiredSub")}</Text>
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("docType")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATS.map((c) => (
            <Pressable key={c || "auto"} testID={`document-category-${c || "auto"}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipOn]}>
              <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{catLabel(c)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {!isPro ? (
          <View style={styles.pro} testID="documents-pro-lock">
            <View style={styles.proBadge}><Ionicons name="ribbon" size={14} color={colors.onGold} /><Text style={styles.proBadgeText}>PRO</Text></View>
            <Text style={styles.proTitle}>{t("proTitle")}</Text>
            <Text style={styles.proSub}>{t("proSub")}</Text>
            <Pressable testID="documents-subscribe-button" onPress={() => router.push("/paywall")} style={styles.proCta}>
              <Text style={styles.proCtaText}>{t("proCta")}</Text>
            </Pressable>
          </View>
        ) : (
        <>
        <Pressable testID="document-dropzone" onPress={pick} disabled={uploading} style={({ pressed }) => [styles.drop, pressed && { opacity: 0.85 }]}>
          {uploading ? (
            <ActivityIndicator color={colors.brandPrimaryText} />
          ) : (
            <>
              <View style={styles.dropIcon}><Ionicons name="cloud-upload-outline" size={26} color={colors.brandPrimaryText} /></View>
              <Text style={styles.dropTitle}>{t("dropTitle")}</Text>
              <Text style={styles.dropSub}>PDF · PNG · JPG · max 20 MB</Text>
            </>
          )}
        </Pressable>
        <ScanFlow category={cat} disabled={uploading} onUploaded={() => { setCat(""); load(); }} />
        </>
        )}
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark" size={14} color={colors.success} />
          <Text style={styles.secureText}>{t("secureStorage")}</Text>
        </View>
      </View>

      {docs?.some((d) => d.category === "payslip") && (
        <Pressable testID="audit-history-button" onPress={() => router.push("/audits")} style={({ pressed }) => [styles.camBtn, pressed && { opacity: 0.85 }]}>
          <Ionicons name="stats-chart-outline" size={20} color={colors.brandPrimaryText} />
          <Text style={styles.camText}>{t("auditHistoryOpen")}</Text>
        </Pressable>
      )}

      {!docs ? (
        <ActivityIndicator color={colors.brandPrimaryText} style={{ marginTop: 16 }} />
      ) : docs.length === 0 ? (
        <Text style={styles.empty} testID="documents-empty">{t("noDocs")}</Text>
      ) : (
        docs.map((d, i) => (
          <Animated.View key={d.doc_id} entering={FadeInDown.delay(i * 50).duration(280)}>
            <Pressable testID={`document-card-${d.doc_id}`} onPress={() => open(d)} style={({ pressed }) => [styles.docCard, pressed && { opacity: 0.92 }]}>
              <View style={styles.thumb}>
                {d.has_thumb && d.thumb_url ? (
                  <Image source={{ uri: absolute(d.thumb_url) }} style={styles.thumbImg} contentFit="cover" contentPosition="top" />
                ) : (
                  <Ionicons name={d.mime === "application/pdf" ? "document-text" : "image"} size={28} color={colors.muted} />
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={styles.rowBetween}>
                  <View style={styles.catTag}><Text style={styles.catTagText}>{catLabel(d.category === "other" ? "other" : d.category)}</Text></View>
                  <Pressable testID={`document-delete-${d.doc_id}`} onPress={() => remove(d.doc_id)} hitSlop={10}>
                    <Ionicons name="trash-outline" size={18} color={colors.muted} />
                  </Pressable>
                </View>
                <Text style={styles.docTitle} numberOfLines={2}>{d.title || d.filename}</Text>
                {d.status === "processing" && (
                  <View style={[styles.status, styles.statusProc]} testID={`document-status-processing-${d.doc_id}`}>
                    <ActivityIndicator size="small" color={colors.warning} />
                    <Text style={[styles.statusText, { color: colors.warning }]}>{t("docProcessing")}</Text>
                  </View>
                )}
                {d.status === "ready" && (
                  <View style={[styles.status, styles.statusOk]} testID={`document-status-ready-${d.doc_id}`}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={[styles.statusText, { color: colors.success }]}>{t("docReady")}</Text>
                  </View>
                )}
                {d.status === "failed" && isPro && (
                  <Pressable onPress={() => retry(d.doc_id)} style={[styles.status, styles.statusFail]} testID={`document-retry-${d.doc_id}`}>
                    <Ionicons name="refresh" size={14} color={colors.error} />
                    <Text style={[styles.statusText, { color: colors.error }]}>{t("docFailed")}</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
            {!!d.summary && (
              <View style={styles.summary} testID={`document-summary-${d.doc_id}`}>
                <View style={styles.summaryHead}>
                  <Ionicons name="sparkles" size={14} color={colors.brandPrimaryText} />
                  <Text style={styles.summaryLabel}>{t("aiSummary")}</Text>
                </View>
                <Text style={styles.summaryText}>{d.summary}</Text>
                {!!d.tags?.length && (
                  <View style={styles.tags}>
                    {d.tags.map((tg) => (
                      <View key={tg} style={styles.tag}><Text style={styles.tagText}>#{tg}</Text></View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {d.category === "payslip" && d.status === "ready" && <AuditCard d={d} isPro={isPro} onRetry={() => reaudit(d.doc_id)} />}
          </Animated.View>
        ))
      )}
    </View>
  );
}

/** Opens the unpaid-wages letter pre-filled with figures from one or more payslip audits. */
export function openAuditLetter(docs: Doc[]) {
  const bad = docs.filter((d) => d.audit?.verdict === "issues");
  const owed = bad.reduce((s, d) => s + (Number(d.audit?.estimated_owed_gbp) || 0), 0);
  const hours = bad.reduce((s, d) => s + (Number(d.audit?.unpaid_hours) || 0), 0);
  const periods = bad.map((d) => d.audit?.pay_period || d.title || d.filename).filter(Boolean).join(", ");
  const issues = [...new Set(bad.flatMap((d) => d.audit?.issues.map((i) => i.title) ?? []))].slice(0, 6).join("; ");
  router.push({
    pathname: "/template/[id]",
    params: { id: "unpaid_wages", from_audit: "1", amount_owed: owed.toFixed(2), pay_period: periods, hours_worked: `${hours} hours${issues ? ` (${issues})` : ""}` },
  });
}

function AuditCard({ d, isPro, onRetry }: { d: Doc; isPro: boolean; onRetry: () => void }) {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  if (d.audit_status === "running")
    return (
      <View style={[styles.audit, styles.auditRun]} testID={`payslip-audit-running-${d.doc_id}`}>
        <ActivityIndicator size="small" color={colors.warning} />
        <Text style={styles.auditRunText}>{t("auditRunning")}</Text>
      </View>
    );
  const a = d.audit;
  if (!a)
    return isPro ? (
      <Pressable onPress={onRetry} style={[styles.audit, styles.auditRun]} testID={`payslip-audit-start-${d.doc_id}`}>
        <Ionicons name="search" size={16} color={colors.brandPrimaryText} />
        <Text style={styles.auditRunText}>{t("auditStart")}</Text>
      </Pressable>
    ) : null;
  const bad = a.verdict === "issues";
  return (
    <View style={[styles.audit, bad ? styles.auditBad : styles.auditOk]} testID={`payslip-audit-${d.doc_id}`}>
      <View style={styles.auditHead}>
        <Ionicons name={bad ? "warning" : "shield-checkmark"} size={18} color={bad ? colors.error : colors.success} />
        <Text style={[styles.auditTitle, { color: bad ? colors.error : colors.success }]}>{bad ? t("auditIssues") : t("auditOk")}</Text>
      </View>
      {bad && (
        <View style={styles.auditStats}>
          <View style={styles.stat}><Text style={styles.statVal} testID={`payslip-unpaid-hours-${d.doc_id}`}>{a.unpaid_hours ?? 0} h</Text><Text style={styles.statLbl}>{t("unpaidHours")}</Text></View>
          <View style={styles.stat}><Text style={styles.statVal} testID={`payslip-owed-${d.doc_id}`}>£{(a.estimated_owed_gbp ?? 0).toFixed(2)}</Text><Text style={styles.statLbl}>{t("owed")}</Text></View>
        </View>
      )}
      <Text style={styles.summaryText}>{a.summary}</Text>
      {a.issues.map((i, k) => (
        <View key={k} style={styles.issue}>
          <View style={[styles.sev, { backgroundColor: i.severity === "high" ? colors.error : i.severity === "medium" ? colors.warning : colors.muted }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.issueTitle}>{i.title}{i.amount_gbp ? ` · £${Number(i.amount_gbp).toFixed(2)}` : ""}</Text>
            <Text style={styles.issueDetail}>{i.detail}</Text>
          </View>
        </View>
      ))}
      {!a.compared_with_contract && <Text style={styles.auditNote}>{t("auditNoContract")}</Text>}
      <View style={styles.auditActions}>
        {bad && (
          <Pressable testID={`payslip-letter-${d.doc_id}`} onPress={() => openAuditLetter([d])} style={styles.auditCta}>
            <Ionicons name="create-outline" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.auditCtaText}>{t("auditLetter")}</Text>
          </Pressable>
        )}
        {isPro && (
          <Pressable testID={`payslip-reaudit-${d.doc_id}`} onPress={onRetry} style={styles.auditSecondary}>
            <Text style={styles.auditSecondaryText}>{t("auditAgain")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  pro: { borderRadius: 16, padding: 20, gap: 8, alignItems: "center", backgroundColor: c.goldSoft, borderWidth: 1.5, borderColor: c.gold },
  proBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.gold, borderRadius: 999, paddingHorizontal: 10, height: 24 },
  proBadgeText: { color: c.onGold, fontWeight: "900", fontSize: 11 },
  proTitle: { color: c.onSurface, fontWeight: "900", fontSize: 16, textAlign: "center" },
  proSub: { color: c.muted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  proCta: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: c.brandPrimary, justifyContent: "center", marginTop: 4 },
  proCtaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, fontSize: 13 },
  camBtn: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.brandPrimaryBorder, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  camText: { color: c.brandPrimaryText, fontWeight: "800", fontSize: 14 },
  audit: { marginTop: 8, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1 },
  auditRun: { flexDirection: "row", alignItems: "center", backgroundColor: c.warningSoft, borderColor: c.warningSoft },
  auditRunText: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  auditBad: { backgroundColor: c.surfaceSecondary, borderColor: c.error },
  auditOk: { backgroundColor: c.successSoft, borderColor: c.success },
  auditHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  auditTitle: { fontWeight: "900", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  auditStats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: 10, padding: 10 },
  statVal: { color: c.error, fontWeight: "900", fontSize: 20 },
  statLbl: { color: c.muted, fontSize: 11, fontWeight: "700" },
  issue: { flexDirection: "row", gap: 10 },
  sev: { width: 4, borderRadius: 2 },
  issueTitle: { color: c.onSurface, fontWeight: "800", fontSize: 13 },
  issueDetail: { color: c.muted, fontSize: 12, lineHeight: 17 },
  auditNote: { color: c.warning, fontSize: 12, fontWeight: "600" },
  auditActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  auditCta: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.brandPrimary },
  auditCtaText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  auditSecondary: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  auditSecondaryText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 12 },
  wrap: { gap: 12 },
  reqBanner: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.warningSoft, borderWidth: 1, borderColor: c.warning },
  reqTitle: { color: c.onSurface, fontWeight: "800", fontSize: 14 },
  reqSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  cardTitle: { color: c.onSurface, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  chips: { gap: 8, paddingRight: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexShrink: 0 },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimaryBorder },
  chipText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: c.onBrandPrimary },
  drop: { borderWidth: 2, borderStyle: "dashed", borderColor: c.brandPrimaryBorder, borderRadius: 16, backgroundColor: c.brandPrimarySoft, alignItems: "center", justifyContent: "center", paddingVertical: 24, gap: 6, minHeight: 130 },
  dropIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  dropTitle: { color: c.onSurface, fontWeight: "800", fontSize: 15 },
  dropSub: { color: c.muted, fontSize: 12 },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  secureText: { color: c.muted, fontSize: 12 },
  empty: { color: c.muted, textAlign: "center", paddingVertical: 16 },
  docCard: { flexDirection: "row", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border },
  thumb: { width: 72, height: 92, borderRadius: 8, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  thumbImg: { width: "100%", height: "100%" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  catTag: { backgroundColor: c.brandSecondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  catTagText: { color: c.onBrandSecondary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  docTitle: { color: c.onSurface, fontWeight: "700", fontSize: 15 },
  status: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, height: 26, borderRadius: 999 },
  statusProc: { backgroundColor: c.warningSoft },
  statusOk: { backgroundColor: c.successSoft },
  statusFail: { backgroundColor: c.surfaceTertiary },
  statusText: { fontSize: 12, fontWeight: "700" },
  summary: { marginTop: -6, marginHorizontal: 8, padding: 12, paddingTop: 16, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, backgroundColor: c.brandPrimarySoft, gap: 6 },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: { color: c.brandPrimaryText, fontWeight: "800", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  summaryText: { color: c.onSurface, fontSize: 13, lineHeight: 19, fontWeight: "500" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: c.surfaceSecondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: c.border },
  tagText: { color: c.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
}));
