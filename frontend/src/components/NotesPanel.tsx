// Notes ("Notatki"): header button + right-side drawer with a grid of note tiles and an in-drawer editor.
// Notes live in MongoDB per user (/api/notes) and are added to Elon's chat context on every message.
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { useReduceMotion } from "@/src/motion";
import { usePro } from "@/src/revenuecat";
import { fx, makeStyles, useTheme } from "@/src/theme";

export type Note = { note_id: string; title: string; content: string; color?: string; created_at: string; updated_at: string };

export const NOTE_TITLE_MAX = 80;
export const NOTE_CONTENT_MAX = 2000;
export const NOTES_MAX = 50;
const NOTES_KEY = ["notes"];

function useNotes(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...NOTES_KEY, user?.user_id], queryFn: () => api<Note[]>("/notes"), enabled: enabled && !!user,
    retry: (n, e) => !(e instanceof ApiError && e.status === 402) && n < 2 });
}

/** Header icon button that opens the notes drawer. Mounted once in Header (right group).
 *  Notes are a PRO feature: free users see a small lock and get the PRO upsell (drawer) instead of their notes. */
export function NotesButton() {
  const [open, setOpen] = useState(false);
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const isPro = usePro();
  const onClose = useCallback(() => setOpen(false), []);
  return (
    <>
      <Pressable testID="header-notes-button" onPress={() => setOpen(true)} style={styles.iconBtn} accessibilityRole="button"
        accessibilityLabel={isPro ? t("notesOpen") : t("notesLockedA11y")}>
        <Ionicons name="document-text-outline" size={23} color={colors.onBrandSecondary} />
        {!isPro && (
          <View style={styles.lockBadge} testID="header-notes-lock">
            <Ionicons name="lock-closed" size={10} color={colors.onAccent} />
          </View>
        )}
      </Pressable>
      {open && <NotesDrawer onClose={onClose} locked={!isPro} />}
    </>
  );
}

function NotesUpsell({ onUnlock }: { onUnlock: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={styles.upsell} testID="notes-pro-upsell">
      <View style={styles.upsellIcon}><Ionicons name="lock-closed" size={26} color={colors.askOrange} /></View>
      <Text style={styles.upsellTitle} accessibilityRole="header">{t("notesProTitle")}</Text>
      <Text style={styles.upsellText}>{t("notesProText")}</Text>
      <Pressable onPress={onUnlock} style={({ pressed }) => [styles.upsellBtn, pressed && styles.pressed]} accessibilityRole="button" testID="notes-pro-unlock">
        <Text style={styles.upsellBtnText}>{t("pwUnlock")}</Text>
      </Pressable>
    </View>
  );
}

function NotesDrawer({ onClose, locked }: { onClose: () => void; locked: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const panelW = width < 600 ? Math.round(width * 0.85) : 380;
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const notes = useNotes(!locked);
  const proRequired = locked || (notes.error instanceof ApiError && notes.error.status === 402);
  const unlock = () => {
    onClose();
    router.push("/paywall");
  };

  const x = useSharedValue(panelW);
  const fade = useSharedValue(0);
  const dur = reduceMotion ? 0 : 240;
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (closing) {
      if (!dur) return onClose();
      fade.value = withTiming(0, { duration: dur });
      x.value = withTiming(panelW, { duration: dur, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(onClose)();
      });
    } else {
      x.value = withTiming(0, { duration: dur, easing: Easing.out(Easing.cubic) });
      fade.value = withTiming(1, { duration: dur });
    }
  }, [closing, dur, panelW, onClose, x, fade]);
  const close = () => setClosing(true);
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Escape (web) / Android back: react-native-web Modal calls onRequestClose on Escape keyup -> editor first, then drawer.
  const list = notes.data ?? [];
  return (
    <Modal visible transparent animationType="none" onRequestClose={() => (editing ? setEditing(null) : close())} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel={t("notesClose")} testID="notes-backdrop" />
        </Animated.View>
        <Animated.View
          style={[styles.panel, { width: panelW, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }, panelStyle]}
          testID="notes-drawer"
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={t("notesTitle")}
        >
          <View style={styles.head}>
            {editing ? (
              <Pressable onPress={() => setEditing(null)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("notesBack")} testID="notes-editor-back">
                <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
              </Pressable>
            ) : (
              <Ionicons name="document-text-outline" size={22} color={colors.askOrange} style={{ marginLeft: 4 }} />
            )}
            <Text style={styles.headTitle} accessibilityRole="header" numberOfLines={1}>
              {editing ? (editing === "new" ? t("notesNew") : t("notesEdit")) : t("notesTitle")}
            </Text>
            <Pressable onPress={close} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("notesClose")} testID="notes-close">
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          {!proRequired && (
            <View style={styles.hint} testID="notes-hint">
              <Ionicons name="eye-outline" size={15} color={colors.warning} />
              <Text style={styles.hintText}>{t("notesHint")}</Text>
            </View>
          )}

          {proRequired ? (
            <NotesUpsell onUnlock={unlock} />
          ) : editing ? (
            <NoteEditor key={editing === "new" ? "new" : editing.note_id} note={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          ) : notes.isLoading ? (
            <View style={styles.center} testID="notes-loading"><ActivityIndicator color={colors.askOrange} /></View>
          ) : notes.isError ? (
            <View style={styles.center} testID="notes-error">
              <Text style={styles.muted}>{t("notesLoadError")}</Text>
              <Pressable onPress={() => notes.refetch()} style={styles.secondaryBtn} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t("notesRetry")}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.grid} testID="notes-grid">
              {list.length < NOTES_MAX && (
                <Pressable onPress={() => setEditing("new")} style={({ pressed }) => [styles.tile, styles.addTile, pressed && styles.pressed]}
                  accessibilityRole="button" accessibilityLabel={t("notesAdd")} testID="notes-add-tile">
                  <Ionicons name="add" size={34} color={colors.askOrange} />
                  <Text style={styles.addText}>{t("notesAdd")}</Text>
                </Pressable>
              )}
              {list.map((n) => (
                <Pressable key={n.note_id} onPress={() => setEditing(n)} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                  accessibilityRole="button" accessibilityLabel={`${t("notesOpenNote")}: ${n.title || n.content.slice(0, 40)}`} testID={`notes-tile-${n.note_id}`}>
                  <View style={styles.tileAccent} />
                  {!!n.title && <Text style={styles.tileTitle} numberOfLines={2}>{n.title}</Text>}
                  <Text style={styles.tileBody} numberOfLines={n.title ? 4 : 6}>{n.content}</Text>
                </Pressable>
              ))}
              {list.length === 0 && (
                <Text style={[styles.muted, styles.empty]} testID="notes-empty">{t("notesEmpty")}</Text>
              )}
              {list.length >= NOTES_MAX && <Text style={[styles.muted, styles.empty]}>{t("notesLimit", { n: String(NOTES_MAX) })}</Text>}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function NoteEditor({ note, onDone }: { note: Note | null; onDone: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focus, setFocus] = useState<"t" | "c" | null>(null);
  const empty = !title.trim() && !content.trim();

  const save = useMutation({
    mutationFn: () => api<Note>(note ? `/notes/${note.note_id}` : "/notes", { method: note ? "PUT" : "POST", body: { title, content } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: NOTES_KEY }); onDone(); },
  });
  const del = useMutation({
    mutationFn: () => api(`/notes/${note!.note_id}`, { method: "DELETE" }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: NOTES_KEY }); onDone(); },
  });
  const err = (save.error || del.error) as Error | null;

  return (
    <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled" testID="notes-editor">
      <Text style={styles.label} nativeID="note-title-label">{t("notesFieldTitle")}</Text>
      <TextInput value={title} onChangeText={setTitle} maxLength={NOTE_TITLE_MAX} placeholder={t("notesTitlePh")} placeholderTextColor={colors.footnote}
        style={[styles.input, focus === "t" && fx("focusRing")]} onFocus={() => setFocus("t")} onBlur={() => setFocus(null)}
        accessibilityLabel={t("notesFieldTitle")} aria-labelledby="note-title-label" testID="notes-input-title" autoFocus={!note} />
      <Text style={styles.label} nativeID="note-content-label">{t("notesFieldContent")}</Text>
      <TextInput value={content} onChangeText={setContent} maxLength={NOTE_CONTENT_MAX} multiline placeholder={t("notesContentPh")} placeholderTextColor={colors.footnote}
        style={[styles.input, styles.textarea, focus === "c" && fx("focusRing")]} onFocus={() => setFocus("c")} onBlur={() => setFocus(null)}
        textAlignVertical="top" accessibilityLabel={t("notesFieldContent")} aria-labelledby="note-content-label" testID="notes-input-content" />
      <Text style={styles.counter}>{content.length}/{NOTE_CONTENT_MAX}</Text>
      {!!err && <Text style={styles.error} testID="notes-save-error">{t("notesSaveError")}</Text>}

      <Pressable onPress={() => save.mutate()} disabled={empty || save.isPending} style={[styles.primaryBtn, (empty || save.isPending) && styles.disabled]}
        accessibilityRole="button" accessibilityLabel={t("notesSave")} accessibilityState={{ disabled: empty || save.isPending }} testID="notes-save">
        {save.isPending ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{t("notesSave")}</Text>}
      </Pressable>

      {note && !confirmDelete && (
        <Pressable onPress={() => setConfirmDelete(true)} style={styles.deleteBtn} accessibilityRole="button" testID="notes-delete">
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.deleteText}>{t("notesDelete")}</Text>
        </Pressable>
      )}
      {note && confirmDelete && (
        <View style={styles.confirm} testID="notes-delete-confirm" accessibilityRole="alert">
          <Text style={styles.confirmText}>{t("notesDeleteConfirm")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setConfirmDelete(false)} style={[styles.secondaryBtn, { flex: 1 }]} accessibilityRole="button" testID="notes-delete-cancel">
              <Text style={styles.secondaryText}>{t("cancel")}</Text>
            </Pressable>
            <Pressable onPress={() => del.mutate()} disabled={del.isPending} style={[styles.dangerBtn, { flex: 1 }]} accessibilityRole="button" testID="notes-delete-yes">
              {del.isPending ? <ActivityIndicator color={colors.onError} /> : <Text style={styles.dangerText}>{t("notesDeleteYes")}</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  lockBadge: { position: "absolute", right: 3, bottom: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.headerBg },
  upsell: { alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 28 },
  upsellIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.askOrangeTint, alignItems: "center", justifyContent: "center" },
  upsellTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900", textAlign: "center" },
  upsellText: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20, textAlign: "center" },
  upsellBtn: { marginTop: 6, minHeight: 48, paddingHorizontal: 22, borderRadius: 12, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  upsellBtnText: { color: c.onAccent, fontWeight: "900", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  root: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  backdrop: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: "rgba(4,10,18,0.62)" },
  panel: { height: "100%", backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.headerBorder, paddingHorizontal: 14, ...fx("shadowOrangeSoft") },
  head: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  headTitle: { flex: 1, color: c.onSurface, fontSize: 18, fontWeight: "800" },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.warningSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 12 },
  hintText: { color: c.warning, fontSize: 12.5, fontWeight: "600", flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 40 },
  muted: { color: c.onSurfaceTertiary, fontSize: 14, textAlign: "center" },
  empty: { width: "100%", marginTop: 8, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingBottom: 24 },
  tile: { width: "48%", aspectRatio: 1, backgroundColor: c.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 12, overflow: "hidden", gap: 4 },
  tileAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: c.askOrange },
  tileTitle: { color: c.warning, fontSize: 14.5, fontWeight: "800", lineHeight: 19, marginTop: 2 },
  tileBody: { color: c.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  addTile: { alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiarySoft, borderStyle: "dashed", borderColor: c.askOrange, borderWidth: 1.5 },
  addText: { color: c.askOrange, fontWeight: "800", fontSize: 14 },
  pressed: { ...fx("cardPressed") },
  editor: { gap: 8, paddingBottom: 24 },
  label: { color: c.muted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  input: { backgroundColor: c.askField, color: c.onSurface, borderRadius: 10, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  textarea: { minHeight: 200 },
  counter: { color: c.footnote, fontSize: 12, textAlign: "right" },
  error: { color: c.error, fontSize: 13 },
  primaryBtn: { backgroundColor: c.askOrange, borderRadius: 12, minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 6 },
  primaryText: { color: c.onAccent, fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.5 },
  secondaryBtn: { borderRadius: 12, minHeight: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  secondaryText: { color: c.onSurface, fontWeight: "700" },
  deleteBtn: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 4 },
  deleteText: { color: c.error, fontWeight: "700" },
  confirm: { backgroundColor: c.errorSoft, borderRadius: 12, padding: 12, gap: 10, marginTop: 6 },
  confirmText: { color: c.onSurface, fontWeight: "600", textAlign: "center" },
  dangerBtn: { backgroundColor: c.error, borderRadius: 12, minHeight: 44, alignItems: "center", justifyContent: "center" },
  dangerText: { color: c.onError, fontWeight: "800" },
}));
