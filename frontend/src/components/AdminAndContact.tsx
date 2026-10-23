import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { FocusTextInput } from "@/src/components/Brand";
import { fx, makeStyles, useTheme } from "@/src/theme";

// Profile section: admin hub link (admins only) + "Contact admin" form (everyone).
export function AdminAndContact() {
  const { user } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === "admin";

  const send = async () => {
    setBusy(true);
    try {
      await api("/contact", { method: "POST", body: { subject, body } });
      toast("Wiadomość wysłana do administratora");
      setSubject("");
      setBody("");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {isAdmin && (
        <Pressable testID="admin-hub-link" onPress={() => router.push("/admin")} style={styles.admin}>
          <Ionicons name="shield-half" size={22} color={colors.onBrandSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.adminTitle}>Hub Administratora</Text>
            <Text style={styles.adminSub}>Statystyki, użytkownicy, promocje, broadcast, wiadomości</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onBrandSecondary} />
        </Pressable>
      )}
      {isAdmin && (
        <Pressable testID="admin-messages-link" onPress={() => router.push("/admin-messages")} style={styles.admin}>
          <Ionicons name="mail-unread-outline" size={22} color={colors.onBrandSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.adminTitle}>Wiadomości do użytkowników</Text>
            <Text style={styles.adminSub}>Wyślij wiadomość do wszystkich lub jednej osoby</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onBrandSecondary} />
        </Pressable>
      )}
      <View style={styles.card} testID="contact-admin-section">
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}><Ionicons name="chatbox-ellipses-outline" size={18} color={colors.brandPrimary} /></View>
          <Text style={styles.title}>Kontakt z administratorem</Text>
        </View>
        <FocusTextInput testID="contact-subject-input" value={subject} onChangeText={setSubject} placeholder="Temat" placeholderTextColor={colors.muted} style={styles.input} />
        <FocusTextInput testID="contact-body-input" value={body} onChangeText={setBody} placeholder="Opisz sprawę…" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 90, textAlignVertical: "top", paddingTop: 10 }]} multiline />
        <Pressable testID="contact-send-button" onPress={send} disabled={busy || !subject.trim() || !body.trim()} style={[styles.cta, (busy || !subject.trim() || !body.trim()) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Wyślij</Text>}
        </Pressable>
      </View>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  admin: { marginHorizontal: 16, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, backgroundColor: c.brandSecondary },
  adminTitle: { color: c.onBrandSecondary, fontWeight: "900", fontSize: 15 },
  adminSub: { color: c.onBrandSecondary, opacity: 0.75, fontSize: 12 },
  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: c.border, ...fx("cardShadow") },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.brandPrimarySoft, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, color: c.brandSecondary, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 12, paddingHorizontal: 14, minHeight: 46, fontSize: 15, color: c.onSurface },
  cta: { minHeight: 46, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
}));
