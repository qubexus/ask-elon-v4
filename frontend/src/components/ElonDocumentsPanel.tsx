// "Dokumenty od Elona" tab of the right-side drawer: storage usage bar + the user's chat-generated documents
// (newest first, paginated) with open / download PDF / send. Uploaded files (Profil → Dokumenty) are separate.
import Ionicons from "@react-native-vector-icons/ionicons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CHAT_DOCS_KEY, ChatDoc, DocPage, downloadPdf, fileUrl, getChatDoc, sharePdf, STORAGE_KEY, StorageUsage, typeKey } from "@/src/chatDocuments";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

const STAMP = require("@/assets/brand/elon-stamp.png");
const PAGE = 20;

export function useStorageUsage(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...STORAGE_KEY, user?.user_id], queryFn: () => api<StorageUsage>("/storage/usage"), enabled: enabled && !!user });
}

export function StorageUsageBar({ usage }: { usage: StorageUsage }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const pct = Math.max(usage.used > 0 ? 1.5 : 0, Math.min(100, usage.percent));
  const tone = usage.full ? colors.error : usage.warn ? colors.askOrange : colors.brandPrimaryText;
  return (
    <View style={[styles.usage, usage.full && styles.usageFull, usage.warn && !usage.full && styles.usageWarn]} testID="storage-usage">
      <View style={styles.usageRow}>
        <Ionicons name="cloud-outline" size={15} color={tone} />
        <Text style={styles.usageText}>{t("stUsage", { used: usage.used_text, limit: usage.limit_text })}</Text>
        <Text style={[styles.usagePct, { color: tone }]}>{Math.round(usage.percent)}%</Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={t("stUsageA11y", { percent: String(Math.round(usage.percent)) })}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(usage.percent) }}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
      {usage.full ? (
        <Text style={[styles.usageMsg, { color: colors.error }]} accessibilityRole="alert" testID="storage-full">{t("stFull")}</Text>
      ) : usage.warn ? (
        <Text style={[styles.usageMsg, { color: colors.warning }]} accessibilityRole="alert" testID="storage-warn">{t("stWarn", { left: usage.remaining_text })}</Text>
      ) : (
        <Text style={styles.usageInfo}>{t("stInfo")}</Text>
      )}
    </View>
  );
}

export function ElonDocumentsPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const toast = useToast();
  const { user, locale } = useAuth();
  const usage = useStorageUsage();
  const q = useInfiniteQuery({
    queryKey: [...CHAT_DOCS_KEY, user?.user_id],
    queryFn: ({ pageParam }) => api<DocPage>(`/chat-documents?limit=${PAGE}&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.has_more ? last.offset + last.items.length : undefined),
    enabled: !!user,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  const act = async (d: ChatDoc, kind: "dl" | "share") => {
    setBusy(`${kind}:${d.chat_doc_id}`);
    try {
      if (kind === "dl") {
        await downloadPdf(d);
        toast(t("edDownloaded"));
      } else {
        const full = await getChatDoc(d.chat_doc_id);
        if ((await sharePdf(full)) === "mail") toast(t("edMailHint"));
      }
    } catch {
      toast(t("edError"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.list} testID="elon-docs">
      {usage.data && <StorageUsageBar usage={usage.data} />}
      <View style={styles.hint}>
        <Image source={STAMP} style={{ width: 20, height: 20 }} accessible={false} />
        <Text style={styles.hintText}>{t("edHint")}</Text>
      </View>
      {q.isLoading ? (
        <View style={styles.center} testID="elon-docs-loading"><ActivityIndicator color={colors.askOrange} /></View>
      ) : q.isError ? (
        <View style={styles.center} testID="elon-docs-error">
          <Text style={styles.muted}>{t("edLoadError")}</Text>
          <Pressable onPress={() => q.refetch()} style={styles.secondaryBtn} accessibilityRole="button" testID="elon-docs-retry">
            <Text style={styles.secondaryText}>{t("notesRetry")}</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty} testID="elon-docs-empty">
          <Image source={STAMP} style={{ width: 64, height: 64, opacity: 0.9 }} accessible={false} />
          <Text style={styles.muted}>{t("edEmpty")}</Text>
        </View>
      ) : (
        <>
          {items.map((d) => (
            <View key={d.chat_doc_id} style={styles.item} testID={`elon-doc-${d.chat_doc_id}`}>
              <Pressable onPress={() => onOpen(d.chat_doc_id)} style={styles.itemTop} accessibilityRole="button" accessibilityLabel={`${t("edOpenDoc")}: ${d.title}`}>
                <View style={styles.thumb}>
                  {d.thumb_url ? <Image source={{ uri: fileUrl(d.thumb_url) }} style={{ width: "100%", height: "100%" }} contentFit="cover" contentPosition="top" accessible={false} />
                    : <Ionicons name="document-text" size={26} color="#0A2A5C" />}
                  <Image source={STAMP} style={styles.miniStamp} accessible={false} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.kind} numberOfLines={1}>{t(typeKey(d.type))}</Text>
                  <Text style={styles.title} numberOfLines={2}>{d.title}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{formatDate(d.created_at, locale)}{d.pages ? ` · ${t("edPages", { n: String(d.pages) })}` : ""}</Text>
                  {!!d.case_title && <Text style={styles.case} numberOfLines={1}>{t("edCase", { name: d.case_title })}</Text>}
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable onPress={() => onOpen(d.chat_doc_id)} style={styles.act} accessibilityRole="button" accessibilityLabel={`${t("edOpen")}: ${d.title}`} testID={`elon-doc-open-${d.chat_doc_id}`}>
                  <Ionicons name="eye-outline" size={16} color={colors.onSurface} />
                  <Text style={styles.actText}>{t("edOpen")}</Text>
                </Pressable>
                <Pressable onPress={() => act(d, "dl")} disabled={!!busy} style={styles.act} accessibilityRole="button" accessibilityLabel={`${t("edDownload")}: ${d.title}`} testID={`elon-doc-download-${d.chat_doc_id}`}>
                  {busy === `dl:${d.chat_doc_id}` ? <ActivityIndicator size="small" color={colors.askOrange} /> : <Ionicons name="download-outline" size={16} color={colors.askOrange} />}
                  <Text style={[styles.actText, { color: colors.askOrange }]}>PDF</Text>
                </Pressable>
                <Pressable onPress={() => act(d, "share")} disabled={!!busy} style={styles.act} accessibilityRole="button" accessibilityLabel={`${t("edShareLong")}: ${d.title}`} testID={`elon-doc-share-${d.chat_doc_id}`}>
                  {busy === `share:${d.chat_doc_id}` ? <ActivityIndicator size="small" color={colors.onSurface} /> : <Ionicons name="share-outline" size={16} color={colors.onSurface} />}
                  <Text style={styles.actText}>{t("edShare")}</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {q.hasNextPage && (
            <Pressable onPress={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} style={[styles.secondaryBtn, { alignSelf: "center" }]} accessibilityRole="button" testID="elon-docs-more">
              {q.isFetchingNextPage ? <ActivityIndicator color={colors.onSurface} /> : <Text style={styles.secondaryText}>{t("edMore")}</Text>}
            </Pressable>
          )}
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  list: { gap: 10, paddingBottom: 24 },
  usage: { backgroundColor: c.surfaceSecondary, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 10, gap: 7 },
  usageWarn: { borderColor: c.askOrange },
  usageFull: { borderColor: c.error, backgroundColor: c.errorSoft },
  usageRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  usageText: { flex: 1, color: c.onSurface, fontSize: 12.5, fontWeight: "700" },
  usagePct: { fontSize: 12.5, fontWeight: "900" },
  track: { height: 8, borderRadius: 4, backgroundColor: c.border, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  usageMsg: { fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  usageInfo: { color: c.footnote, fontSize: 11.5 },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.warningSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  hintText: { color: c.warning, fontSize: 12.5, fontWeight: "600", flex: 1 },
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  empty: { alignItems: "center", gap: 12, paddingVertical: 28, paddingHorizontal: 8 },
  muted: { color: c.onSurfaceTertiary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  item: { backgroundColor: c.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  itemTop: { flexDirection: "row", gap: 10, padding: 10 },
  thumb: { width: 54, height: 70, borderRadius: 4, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  miniStamp: { position: "absolute", right: -7, bottom: -6, width: 26, height: 26, transform: [{ rotate: "-12deg" }] },
  kind: { color: c.askOrange, fontSize: 10.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { color: c.onSurface, fontSize: 14, fontWeight: "800", lineHeight: 18 },
  meta: { color: c.muted, fontSize: 11.5 },
  case: { color: c.brandPrimaryText, fontSize: 11.5, fontWeight: "700" },
  actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border },
  act: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 40 },
  actText: { color: c.onSurface, fontSize: 12.5, fontWeight: "700" },
  secondaryBtn: { borderRadius: 12, minHeight: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  secondaryText: { color: c.onSurface, fontWeight: "700" },
}));
