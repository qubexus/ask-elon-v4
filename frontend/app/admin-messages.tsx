import Ionicons from "@react-native-vector-icons/ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";

type Sent = { id: string; title: string; target: "all" | "user"; recipient_email?: string | null; created_at: string; read_count: number };

const confirm = (msg: string) =>
  Platform.OS === "web"
    ? Promise.resolve(window.confirm(msg))
    : new Promise<boolean>((res) => Alert.alert("Potwierdź", msg, [{ text: "Anuluj", style: "cancel", onPress: () => res(false) }, { text: "OK", onPress: () => res(true) }]));

export default function AdminMessages() {
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [target, setTarget] = useState<"all" | "user">("all");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    try {
      setSent(await api<Sent[]>("/admin/messages"));
    } catch (e: any) {
      if (String(e.message).includes("Admin")) setForbidden(true);
      setSent([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (target === "all" && !(await confirm("Wysłać tę wiadomość do WSZYSTKICH użytkowników?"))) return;
    setBusy(true);
    try {
      await api("/admin/messages", { method: "POST", body: { title, body, link: link || null, target, email: target === "user" ? email : null } });
      toast("Wiadomość wysłana");
      setTitle("");
      setBody("");
      setLink("");
      setEmail("");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Sent) => {
    if (!(await confirm(`Usunąć wiadomość „${m.title}”?`))) return;
    try {
      await api(`/admin/messages/${m.id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  const valid = title.trim().length > 0 && title.length <= 120 && body.trim().length > 0 && body.length <= 2000 && (target === "all" || email.includes("@"));

  return (
    <View style={styles.root} testID="admin-messages-screen">
      <Header back title="Wiadomości do użytkowników" subtitle="Ask Elon · Admin" />
      {forbidden ? (
        <View style={styles.forbidden} testID="admin-messages-forbidden">
          <Ionicons name="lock-closed" size={36} color={colors.error} />
          <Text style={styles.forbiddenText}>Brak dostępu (403). Ta strona jest tylko dla administratora.</Text>
        </View>
      ) : (
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.card}>
            <Text style={styles.label}>Tytuł ({title.length}/120)</Text>
            <TextInput testID="admin-msg-title" value={title} onChangeText={setTitle} maxLength={120} placeholder="np. Nowe pisma w aplikacji" placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>Treść ({body.length}/2000)</Text>
            <TextInput testID="admin-msg-body" value={body} onChangeText={setBody} maxLength={2000} multiline placeholder="Treść wiadomości…" placeholderTextColor={colors.muted} style={[styles.input, styles.multi]} />
            <Text style={styles.label}>Link (opcjonalny)</Text>
            <TextInput testID="admin-msg-link" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://…" placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>Odbiorca</Text>
            <View style={styles.seg}>
              {(["all", "user"] as const).map((v) => (
                <Pressable key={v} testID={`admin-msg-target-${v}`} onPress={() => setTarget(v)} style={[styles.segBtn, target === v && styles.segActive]}>
                  <Text style={[styles.segText, target === v && styles.segTextActive]}>{v === "all" ? "Wszyscy użytkownicy" : "Jeden użytkownik"}</Text>
                </Pressable>
              ))}
            </View>
            {target === "user" && (
              <TextInput testID="admin-msg-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-mail użytkownika" placeholderTextColor={colors.muted} style={styles.input} />
            )}
            <Pressable testID="admin-msg-send" onPress={send} disabled={!valid || busy} style={[styles.send, (!valid || busy) && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.sendText}>Wyślij wiadomość</Text>}
            </Pressable>
          </View>

          <Text style={styles.section}>Wysłane wiadomości</Text>
          {!sent ? (
            <ActivityIndicator color={colors.askOrange} />
          ) : sent.length === 0 ? (
            <Text style={styles.muted}>Brak wysłanych wiadomości.</Text>
          ) : (
            sent.map((m) => (
              <View key={m.id} style={styles.row} testID={`admin-msg-row-${m.id}`}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={styles.muted}>
                    {new Date(m.created_at).toLocaleString()} · {m.target === "all" ? "Wszyscy" : m.recipient_email} · przeczytane: {m.read_count}
                  </Text>
                </View>
                <Pressable testID={`admin-msg-delete-${m.id}`} onPress={() => remove(m)} style={styles.del} hitSlop={6}>
                  <Text style={styles.delText}>Usuń</Text>
                </Pressable>
              </View>
            ))
          )}
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  body: { padding: 16, gap: 12 },
  card: { backgroundColor: c.askField, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: c.askBorder },
  label: { color: c.askNavy, fontWeight: "700", fontSize: 13, marginTop: 4 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.askBorder, paddingHorizontal: 12, color: c.askInk, fontSize: 15, backgroundColor: c.surface },
  multi: { minHeight: 120, paddingTop: 12, textAlignVertical: "top" },
  seg: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: c.askBorder, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  segActive: { backgroundColor: c.askOrange, borderColor: c.askOrange },
  segText: { color: c.askNavy, fontWeight: "700", fontSize: 13 },
  segTextActive: { color: c.onBrandPrimary },
  send: { marginTop: 8, minHeight: 50, borderRadius: 12, backgroundColor: c.askGreen, alignItems: "center", justifyContent: "center" },
  sendText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 15 },
  section: { color: c.askNavy, fontWeight: "900", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.askField, borderWidth: 1, borderColor: c.askBorder },
  rowTitle: { color: c.askInk, fontWeight: "800", fontSize: 14 },
  muted: { color: c.muted, fontSize: 12 },
  del: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.error, justifyContent: "center" },
  delText: { color: c.error, fontWeight: "800", fontSize: 13 },
  forbidden: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  forbiddenText: { color: c.onSurfaceTertiary, textAlign: "center", fontSize: 15 },
}));
