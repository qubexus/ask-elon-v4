// "Usuń konto" (GDPR right to erasure) at the bottom of Profil: two steps, password re-entry for password accounts.
// The server removes cases, chats, letters, notes, documents with files etc. (backend/account_deletion.py).
import Ionicons from "@react-native-vector-icons/ionicons";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";

import { api, ApiError } from "@/src/api";
import { useAuth, User } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";

export function DeleteAccount() {
  const { deleteAccount } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [hasPassword, setHasPassword] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setStep("confirm");
    try {
      const me = await api<User>("/auth/me");
      setHasPassword(me.has_password !== false);
    } catch {}
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await deleteAccount(hasPassword ? password : undefined);
      toast(t("delDone"));
    } catch (e: any) {
      const c = e instanceof ApiError ? e.code : undefined;
      toast(c === "wrong_password" ? t("delWrongPw") : c === "subscription_active" ? t("delSubActive") : c === "admin_protected" ? t("delAdmin") : e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.section, fx("cardShadow")]} testID="delete-account-section">
      <Text style={styles.title}>{t("delTitle")}</Text>
      <Text style={styles.sub}>{t("delSub")}</Text>
      {step === "idle" ? (
        <Pressable testID="delete-account-open" onPress={start} accessibilityRole="button" style={({ pressed }) => [styles.outline, pressed && { opacity: 0.8 }]}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={styles.outlineText}>{t("delOpen")}</Text>
        </Pressable>
      ) : (
        <View style={styles.confirm} testID="delete-account-confirm">
          <Text style={styles.confirmQ}>{t("delConfirmQ")}</Text>
          {hasPassword && (
            <TextInput
              testID="delete-account-password"
              value={password}
              onChangeText={setPassword}
              placeholder={t("delPassword")}
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              style={[styles.input, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
            />
          )}
          <View style={styles.row}>
            <Pressable testID="delete-account-cancel" onPress={() => { setStep("idle"); setPassword(""); }} accessibilityRole="button" style={[styles.secondary, { flex: 1 }]}>
              <Text style={styles.secondaryText}>{t("delCancel")}</Text>
            </Pressable>
            <Pressable
              testID="delete-account-yes"
              onPress={confirm}
              disabled={busy || (hasPassword && password.length < 1)}
              accessibilityRole="button"
              style={[styles.danger, { flex: 1 }, (busy || (hasPassword && !password)) && { opacity: 0.55 }]}
            >
              {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.dangerText}>{t("delYes")}</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  section: { marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  title: { color: c.error, fontSize: 12.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  sub: { color: c.muted, fontSize: 13, lineHeight: 19 },
  outline: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.error, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  outlineText: { color: c.error, fontWeight: "800", fontSize: 14 },
  confirm: { backgroundColor: c.errorSoft, borderRadius: 12, padding: 12, gap: 10 },
  confirmQ: { color: c.onSurface, fontWeight: "700", textAlign: "center", fontSize: 15 },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, fontSize: 16, color: c.onSurface },
  row: { flexDirection: "row", gap: 10 },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  danger: { minHeight: 48, borderRadius: 12, backgroundColor: c.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  dangerText: { color: c.onAccent, fontWeight: "800", fontSize: 14, textAlign: "center" },
}));
