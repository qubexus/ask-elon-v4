// Notes ("Notatki"): header button + right-side drawer with a grid of note tiles and an in-drawer editor.
// Notes live in MongoDB per user (/api/notes) and are added to Elon's chat context on every message.
// Second tab "Dokumenty od Elona": PDFs Elon wrote in the chat (ElonDocumentsPanel) + storage usage.
import Ionicons from "@react-native-vector-icons/ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { ChatDocumentViewer } from "@/src/components/ChatDocumentViewer";
import { ElonDocumentsPanel } from "@/src/components/ElonDocumentsPanel";
import { RightDrawer } from "@/src/components/RightDrawer";
import { fx, makeStyles, useTheme } from "@/src/theme";

export type Note = { note_id: string; title: string; content: string; color?: string; created_at: string; updated_at: string };

export const NOTE_TITLE_MAX = 80;
export const NOTE_CONTENT_MAX = 2000;
export const NOTES_MAX = 50;
const NOTES_KEY = ["notes"];

function useNotes(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({ queryKey: [...NOTES_KEY, user?.user_id], queryFn: () => api<Note[]>("/notes"), enabled: enabled && !!user });
}

/** Header icon button that opens the notes drawer. Mounted once in Header (right group). */
export function NotesButton() {
  const [open, setOpen] = useState(false);
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const onClose = useCallback(() => setOpen(false), []);
  return (
    <>
      <Pressable testID="header-notes-button" onPress={() => setOpen(true)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("notesOpen")}>
        <Ionicons name="document-text-outline" size={23} color={colors.onBrandSecondary} />
      </Pressable>
      {open && <NotesDrawer onClose={onClose} />}
    </>
  );
}

type DrawerTab = "notes" | "docs";
let lastTab: DrawerTab = "notes"; // the drawer reopens on the tab the user left it on
const rememberTab = (v: DrawerTab) => { lastTab = v; };
const savedTab = () => lastTab;

export function NotesDrawer({ onClose, initialTab }: { onClose: () => void; initialTab?: DrawerTab }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const [tab, setTabState] = useState<DrawerTab>(initialTab ?? savedTab);
  const setTab = (v: DrawerTab) => { rememberTab(v); setTabState(v); setEditing(null); };
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const notes = useNotes(tab === "notes");
  const list = notes.data ?? [];

  // Escape (web) / Android back: leave the editor first, then close the drawer.
  return (
    <RightDrawer
      onClose={onClose}
      idBase="notes"
      title={editing ? (editing === "new" ? t("notesNew") : t("notesEdit")) : tab === "docs" ? t("edTitle") : t("notesTitle")}
      closeLabel={t("notesClose")}
      onBack={() => (openDoc ? (setOpenDoc(null), true) : editing ? (setEditing(null), true) : false)}
      leading={
        editing ? (
          <Pressable onPress={() => setEditing(null)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("notesBack")} testID="notes-editor-back">
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
        ) : (
          <Ionicons name={tab === "docs" ? "documents-outline" : "document-text-outline"} size={22} color={colors.askOrange} style={{ marginLeft: 4 }} />
        )
      }
    >
      {() => (
        <>
          {!editing && (
            <View style={styles.tabs} role="tablist" aria-label={t("edTabsLabel")} testID="drawer-tabs">
              {(["notes", "docs"] as const).map((k) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabOn]} role="tab"
                  accessibilityRole="tab" accessibilityState={{ selected: tab === k }} aria-selected={tab === k} testID={`drawer-tab-${k}`}>
                  <Ionicons name={k === "docs" ? "documents-outline" : "document-text-outline"} size={15} color={tab === k ? colors.onAccent : colors.muted} />
                  <Text style={[styles.tabText, tab === k && styles.tabTextOn]} numberOfLines={1}>{k === "docs" ? t("edTab") : t("edTabNotes")}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {tab === "notes" && (
            <View style={styles.hint} testID="notes-hint">
              <Ionicons name="eye-outline" size={15} color={colors.warning} />
              <Text style={styles.hintText}>{t("notesHint")}</Text>
            </View>
          )}
          {tab === "docs" ? (
            <ElonDocumentsPanel onOpen={setOpenDoc} />
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
          {openDoc && <ChatDocumentViewer id={openDoc} onClose={() => setOpenDoc(null)} />}
        </>
      )}
    </RightDrawer>
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
  tabs: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 12, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, marginBottom: 10 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 38, borderRadius: 9, paddingHorizontal: 6 },
  tabOn: { backgroundColor: c.askOrange },
  tabText: { color: c.muted, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  tabTextOn: { color: c.onAccent },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
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
