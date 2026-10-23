// Full view of a document Elon wrote: the letter as it appears in the PDF, optional translation, and actions
// (download PDF, send/share, edit, delete). Sending never happens automatically: "Send" opens the system share
// sheet with the PDF, or (where files can't be shared) downloads the PDF and opens a pre-filled e-mail draft.
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CHAT_DOCS_KEY, ChatDocFull, downloadPdf, getChatDoc, prefetchPdf, sharePdf, STORAGE_KEY, typeKey } from "@/src/chatDocuments";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { useReduceMotion } from "@/src/motion";
import { fx, makeStyles, useTheme } from "@/src/theme";

const STAMP = require("@/assets/brand/elon-stamp.png");
const BODY_MAX = 8000;

export function ChatDocumentViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { locale } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const wide = width >= 760;
  const q = useQuery({ queryKey: ["chat-document", id], queryFn: () => getChatDoc(id) });
  const doc = q.data;
  const [showTr, setShowTr] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [mailHint, setMailHint] = useState(false);
  const [busy, setBusy] = useState<"dl" | "share" | null>(null);

  useEffect(() => {
    if (doc) prefetchPdf(doc);
  }, [doc]);

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: CHAT_DOCS_KEY }), qc.invalidateQueries({ queryKey: STORAGE_KEY })]);
  };
  const errText = (e: unknown) => (e instanceof ApiError && e.code === "storage_full" ? e.message : t("edError"));

  const save = useMutation({
    mutationFn: () => api<ChatDocFull>(`/chat-documents/${encodeURIComponent(id)}`, { method: "PUT", body: { subject, body } }),
    onSuccess: async (d) => {
      qc.setQueryData(["chat-document", id], d);
      await refresh();
      setEditing(false);
      toast(t("edSaved"));
    },
    onError: (e) => toast(errText(e), "error"),
  });
  const del = useMutation({
    mutationFn: () => api(`/chat-documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      qc.removeQueries({ queryKey: ["chat-document", id] });
      toast(t("edDeleted"));
      onClose();
    },
    onError: () => toast(t("edError"), "error"),
  });

  const download = async () => {
    if (!doc) return;
    setBusy("dl");
    try {
      await downloadPdf(doc);
      toast(t("edDownloaded"));
    } catch {
      toast(t("edError"), "error");
    } finally {
      setBusy(null);
    }
  };
  const share = async () => {
    if (!doc) return;
    setBusy("share");
    try {
      const r = await sharePdf(doc);
      setMailHint(r === "mail");
    } catch {
      toast(t("edError"), "error");
    } finally {
      setBusy(null);
    }
  };
  const startEdit = () => {
    if (!doc) return;
    setSubject(doc.subject || "");
    setBody(doc.body);
    setEditing(true);
  };

  const L = doc?.language === "pl" ? "Dotyczy" : doc?.language === "ro" ? "Subiect" : "Subject";
  return (
    <Modal visible transparent animationType={reduce ? "none" : "fade"} onRequestClose={() => (editing ? setEditing(false) : onClose())} statusBarTranslucent>
      <View style={[styles.root, wide && styles.rootWide]}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("edClose")} testID="doc-viewer-backdrop" />
        <View
          style={[styles.sheet, wide ? styles.sheetWide : { paddingTop: insets.top + 6 }]}
          testID="doc-viewer"
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={doc?.title || t("edTitle")}
        >
          <View style={styles.head}>
            <Image source={STAMP} style={{ width: 30, height: 30 }} accessible={false} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kind} numberOfLines={1}>{doc ? t(typeKey(doc.type)) : t("edTitle")}</Text>
              <Text style={styles.headTitle} numberOfLines={2} accessibilityRole="header">{doc?.title ?? ""}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("edClose")} testID="doc-viewer-close">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>

          {q.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.askOrange} /></View>
          ) : q.isError || !doc ? (
            <View style={styles.center} testID="doc-viewer-error">
              <Text style={styles.muted}>{q.error instanceof ApiError && q.error.status === 404 ? t("edGone") : t("edLoadError")}</Text>
              {!(q.error instanceof ApiError && q.error.status === 404) && (
                <Pressable onPress={() => q.refetch()} style={styles.secondaryBtn} accessibilityRole="button"><Text style={styles.secondaryText}>{t("notesRetry")}</Text></Pressable>
              )}
            </View>
          ) : (
            <>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID="doc-viewer-scroll">
                <Text style={styles.meta}>
                  {formatDate(doc.created_at, locale)}
                  {doc.pages ? ` · ${t("edPages", { n: String(doc.pages) })}` : ""}
                  {doc.case_title ? ` · ${t("edCase", { name: doc.case_title })}` : ""}
                </Text>
                {editing ? (
                  <View style={{ gap: 8 }} testID="doc-viewer-editor">
                    <Text style={styles.label}>{t("edSubject")}</Text>
                    <TextInput value={subject} onChangeText={setSubject} maxLength={200} style={styles.input} accessibilityLabel={t("edSubject")} testID="doc-edit-subject" />
                    <Text style={styles.label}>{t("edBody")}</Text>
                    <TextInput value={body} onChangeText={setBody} maxLength={BODY_MAX} multiline textAlignVertical="top" style={[styles.input, styles.textarea]}
                      accessibilityLabel={t("edBody")} testID="doc-edit-body" />
                    <Text style={styles.counter}>{body.length}/{BODY_MAX}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable onPress={() => setEditing(false)} style={[styles.secondaryBtn, { flex: 1 }]} accessibilityRole="button" testID="doc-edit-cancel">
                        <Text style={styles.secondaryText}>{t("edCancel")}</Text>
                      </Pressable>
                      <Pressable onPress={() => save.mutate()} disabled={save.isPending || body.trim().length < 40} style={[styles.primaryBtn, { flex: 2 }, (save.isPending || body.trim().length < 40) && { opacity: 0.5 }]}
                        accessibilityRole="button" testID="doc-edit-save">
                        {save.isPending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t("edSave")}</Text>}
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={styles.paper} testID="doc-viewer-paper">
                    <Image source={STAMP} style={styles.paperStamp} accessible accessibilityLabel={t("edStampAlt")} alt={t("edStampAlt")} />
                    <View style={{ marginRight: 84, marginBottom: 14 }}>
                      {doc.snapshot.sender_lines.map((l, i) => (
                        <Text key={i} style={i === 0 ? styles.pSender : styles.pSmall}>{l}</Text>
                      ))}
                    </View>
                    <Text style={[styles.pSmall, { marginBottom: 12 }]}>{doc.snapshot.date_text}</Text>
                    <View style={{ marginBottom: 14 }}>
                      {doc.snapshot.recipient_lines.map((l, i) => <Text key={i} style={styles.pText}>{l}</Text>)}
                    </View>
                    {!!doc.subject && <Text style={styles.pSubject}>{L}: {doc.subject}</Text>}
                    <Text style={styles.pText} selectable>{doc.body}</Text>
                  </View>
                )}
                {!editing && !!doc.translation && (
                  <View style={{ gap: 8 }}>
                    <Pressable onPress={() => setShowTr((v) => !v)} style={styles.linkBtn} accessibilityRole="button" accessibilityState={{ expanded: showTr }} testID="doc-viewer-translation-toggle">
                      <Ionicons name="language-outline" size={16} color={colors.askOrange} />
                      <Text style={styles.linkText}>{showTr ? t("edHideTranslation") : t("edShowTranslation")}</Text>
                    </Pressable>
                    {showTr && (
                      <View style={styles.trBox} testID="doc-viewer-translation">
                        <Text style={styles.label}>{t("edTranslation")}</Text>
                        <Text style={styles.trText} selectable>{doc.translation}</Text>
                      </View>
                    )}
                  </View>
                )}
                <View style={styles.disclaimer}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                  <Text style={styles.disclaimerText}>{t("edDisclaimer")}</Text>
                </View>
                {!editing && (
                  confirmDel ? (
                    <View style={styles.confirm} accessibilityRole="alert" testID="doc-delete-confirm">
                      <Text style={styles.confirmText}>{t("edDeleteConfirm")}</Text>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable onPress={() => setConfirmDel(false)} style={[styles.secondaryBtn, { flex: 1 }]} accessibilityRole="button" testID="doc-delete-cancel">
                          <Text style={styles.secondaryText}>{t("edCancel")}</Text>
                        </Pressable>
                        <Pressable onPress={() => del.mutate()} disabled={del.isPending} style={[styles.dangerBtn, { flex: 1 }]} accessibilityRole="button" testID="doc-delete-yes">
                          {del.isPending ? <ActivityIndicator color={colors.onError} /> : <Text style={styles.dangerText}>{t("notesDeleteYes")}</Text>}
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setConfirmDel(true)} style={styles.deleteBtn} accessibilityRole="button" testID="doc-delete">
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <Text style={styles.deleteText}>{t("edDelete")}</Text>
                    </Pressable>
                  )
                )}
              </ScrollView>
              {mailHint && (
                <View style={[styles.hint, { marginBottom: 8 }]} accessibilityRole="alert" testID="doc-viewer-mail-hint">
                  <Ionicons name="mail-outline" size={16} color={colors.brandPrimaryText} />
                  <Text style={styles.hintText}>{t("edMailHint")}</Text>
                </View>
              )}
              {!editing && (
                <View style={[styles.actions, { paddingBottom: (wide ? 0 : insets.bottom) + 12 }]}>
                  <Pressable onPress={download} disabled={!!busy} style={({ pressed }) => [styles.primaryBtn, { flex: 1.3 }, pressed && fx("glowOrange")]}
                    accessibilityRole="button" accessibilityLabel={t("edDownload")} testID="doc-download">
                    {busy === "dl" ? <ActivityIndicator color={colors.onAccent} /> : (
                      <><Ionicons name="download-outline" size={18} color={colors.onAccent} /><Text style={styles.primaryText}>{t("edDownload")}</Text></>
                    )}
                  </Pressable>
                  <Pressable onPress={share} disabled={!!busy} style={[styles.secondaryBtn, { flex: 1 }]} accessibilityRole="button" accessibilityLabel={t("edShareLong")} testID="doc-share">
                    {busy === "share" ? <ActivityIndicator color={colors.onSurface} /> : (
                      <><Ionicons name="share-outline" size={18} color={colors.onSurface} /><Text style={styles.secondaryText}>{t("edShare")}</Text></>
                    )}
                  </Pressable>
                  <Pressable onPress={startEdit} style={[styles.secondaryBtn, styles.squareBtn]} accessibilityRole="button" accessibilityLabel={t("edEdit")} testID="doc-edit">
                    <Ionicons name="create-outline" size={20} color={colors.onSurface} />
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1 },
  rootWide: { alignItems: "center", justifyContent: "center", padding: 24 },
  backdrop: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: "rgba(4,10,18,0.72)" },
  sheet: { flex: 1, backgroundColor: c.surface, paddingHorizontal: 14 },
  sheetWide: { flex: 0, width: 720, maxWidth: "100%", height: "92%", borderRadius: 18, borderWidth: 1, borderColor: c.headerBorder, paddingTop: 12, ...fx("shadowOrangeSoft") },
  head: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border },
  kind: { color: c.askOrange, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  headTitle: { color: c.onSurface, fontSize: 17, fontWeight: "800", lineHeight: 22 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: c.onSurfaceTertiary, fontSize: 14, textAlign: "center" },
  scroll: { paddingVertical: 14, gap: 12 },
  meta: { color: c.muted, fontSize: 12.5 },
  paper: { backgroundColor: "#FFFFFF", borderRadius: 6, padding: 18, paddingTop: 20, ...fx("shadowOrangeSoft") },
  paperStamp: { position: "absolute", top: 12, right: 12, width: 72, height: 72, transform: [{ rotate: "-12deg" }] },
  pSender: { color: "#0A2A5C", fontSize: 14, fontWeight: "800", lineHeight: 20 },
  pSmall: { color: "#3C4654", fontSize: 12.5, lineHeight: 18 },
  pText: { color: "#1D2530", fontSize: 14, lineHeight: 21 },
  pSubject: { color: "#0A2A5C", fontSize: 14, fontWeight: "800", lineHeight: 20, marginBottom: 12 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 36 },
  linkText: { color: c.askOrange, fontWeight: "800", fontSize: 13 },
  trBox: { backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, gap: 6, borderWidth: 1, borderColor: c.border },
  trText: { color: c.onSurface, fontSize: 14, lineHeight: 21 },
  disclaimer: { flexDirection: "row", gap: 8, backgroundColor: c.warningSoft, borderRadius: 10, padding: 10, alignItems: "flex-start" },
  disclaimerText: { flex: 1, color: c.warning, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  hint: { flexDirection: "row", gap: 8, backgroundColor: c.brandPrimarySoft, borderRadius: 10, padding: 10, alignItems: "flex-start" },
  hintText: { flex: 1, color: c.onSurface, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  label: { color: c.muted, fontSize: 13, fontWeight: "700" },
  input: { backgroundColor: c.askField, color: c.onSurface, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textarea: { minHeight: 320 },
  counter: { color: c.footnote, fontSize: 12, textAlign: "right" },
  actions: { flexDirection: "row", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
  primaryBtn: { flexDirection: "row", gap: 6, backgroundColor: c.askOrange, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  primaryText: { color: c.onAccent, fontWeight: "800", fontSize: 14.5 },
  secondaryBtn: { flexDirection: "row", gap: 6, borderRadius: 12, minHeight: 48, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  squareBtn: { width: 48, paddingHorizontal: 0 },
  secondaryText: { color: c.onSurface, fontWeight: "700", fontSize: 14.5 },
  deleteBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", minHeight: 44 },
  deleteText: { color: c.error, fontWeight: "700" },
  confirm: { backgroundColor: c.errorSoft, borderRadius: 12, padding: 12, gap: 10 },
  confirmText: { color: c.onSurface, fontWeight: "600", textAlign: "center" },
  dangerBtn: { backgroundColor: c.error, borderRadius: 12, minHeight: 44, alignItems: "center", justifyContent: "center" },
  dangerText: { color: c.onError, fontWeight: "800" },
}));
