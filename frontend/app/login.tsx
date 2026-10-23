import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BRAND_PLAIN, withBrand } from "@/src/components/BrandName";
import { SiteFooter } from "@/src/components/SiteFooter";
import Head from "expo-router/head";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { useToast } from "@/src/components/Toast";
import { Locale, useT } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";

type Mode = "login" | "register" | "reset";
const LANGS: { id: Locale; flag: string; label: string }[] = [
  { id: "en", flag: "🇬🇧", label: "EN" },
  { id: "pl", flag: "🇵🇱", label: "PL" },
  { id: "ro", flag: "🇷🇴", label: "RO" },
];

function Field({ icon, right, onFocus, onBlur, ...props }: { icon: any; right?: React.ReactNode } & React.ComponentProps<typeof TextInput>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && fx("focusRing"), focused && styles.fieldFocus]}>
      <Ionicons name={icon} size={20} color={colors.askNavy} />
      <TextInput
        placeholderTextColor={colors.muted}
        style={[styles.fieldInput, Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null]}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {right}
    </View>
  );
}

export default function Login() {
  const { signIn, emailLogin, emailRegister, googleEnabled, resetPassword, locale, setLocale } = useAuth();
  const t = useT();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const submit = () =>
    run("submit", async () => {
      if (mode === "login") await emailLogin(email.trim(), password);
      else if (mode === "register") await emailRegister(name.trim(), email.trim(), password);
      else if (!codeSent) {
        await api("/auth/request-reset", { method: "POST", body: { email: email.trim() } });
        setCodeSent(true);
        toast(t("resetSent"));
      } else await resetPassword(email.trim(), code, password);
    });

  const canSubmit =
    email.includes("@") && (mode === "reset" && !codeSent ? true : password.length >= (mode === "login" ? 1 : 8)) && (mode !== "reset" || !codeSent || code.length === 6);
  const ctaLabel = mode === "login" ? t("loginCta") : mode === "register" ? t("registerCta") : codeSent ? t("resetCta") : t("resetSend");

  return (
    <View style={styles.root} testID="login-screen">
      <Head><title>{t("loginPageTitle")}</title></Head>
      <LinearGradient colors={[colors.askBgTop, colors.askBgMid, colors.askBgBottom]} locations={[0, 0.55, 1]} style={StyleFill} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.topRow}>
          <View style={styles.brandBadge} testID="login-brand-badge">
            <View style={styles.greenDot} />
            <Text style={styles.brandBadgeText}>{withBrand(t("brandBadge"))}</Text>
          </View>
          <View style={styles.langs} testID="language-switch">
            {LANGS.map((l) => (
              <Pressable key={l.id} testID={`language-option-${l.id}`} onPress={() => setLocale(l.id)} style={[styles.lang, locale === l.id && styles.langActive]}>
                <Text style={styles.flag}>{l.flag}</Text>
                <Text style={[styles.langText, locale === l.id && styles.langTextActive]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(450)} style={styles.logoBlock}>
          <Image testID="login-logo" source={require("@/assets/brand/logo-ask-elon-ciemne-tlo.png")} style={styles.logo} contentFit="contain" accessibilityLabel={BRAND_PLAIN} alt={BRAND_PLAIN} />
          <Text style={styles.motto}>{t("mottoFull")}</Text>
          <View style={styles.tagline} testID="login-tagline">
            <View style={styles.greenDot} />
            <Text style={styles.taglineText}>{t("tagline")}</Text>
          </View>
        </Animated.View>

        {mode !== "reset" ? (
          <View style={styles.tabs}>
            {(["login", "register"] as const).map((m) => (
              <Pressable key={m} testID={`auth-tab-${m}`} onPress={() => setMode(m)} style={[styles.tab, mode === m && styles.tabActive]}>
                <Ionicons name={m === "login" ? "log-in-outline" : "person-add"} size={18} color={mode === m ? colors.onBrandPrimary : colors.askNavy} />
                <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>{m === "login" ? t("tabLogin") : t("tabRegister")}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.resetHead}>
            <Text style={styles.resetTitle} testID="reset-title">{t("resetTitle")}</Text>
          </View>
        )}

        <View style={styles.form}>
          {mode === "register" && <Field testID="register-name-input" icon="person-outline" placeholder={t("name")} value={name} onChangeText={setName} />}
          <Field
            testID="auth-email-input"
            icon="mail-outline"
            placeholder={t("email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            editable={!(mode === "reset" && codeSent)}
          />
          {mode === "reset" && codeSent && (
            <Field testID="reset-code-input" icon="keypad-outline" placeholder={t("resetCode")} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" />
          )}
          {(mode !== "reset" || codeSent) && (
            <Field
              testID="auth-password-input"
              icon="lock-closed-outline"
              placeholder={mode === "reset" ? t("newPassword") : t("password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              right={
                <Pressable testID="auth-password-toggle" onPress={() => setShowPw((s) => !s)} hitSlop={10} style={styles.eye}>
                  <Ionicons name={showPw ? "eye-outline" : "eye-off-outline"} size={22} color={colors.askNavy} />
                </Pressable>
              }
            />
          )}
          {mode !== "login" && (mode !== "reset" || codeSent) && <Text style={styles.hint}>{t("pwHint")}</Text>}
          {mode === "login" && (
            <Pressable testID="forgot-password-link" onPress={() => { setMode("reset"); setCodeSent(false); setPassword(""); }} style={styles.forgot}>
              <Text style={styles.forgotText}>{t("forgot")} →</Text>
            </Pressable>
          )}
        </View>

        <Pressable testID="auth-submit-button" onPress={submit} disabled={!canSubmit || !!busy} style={({ pressed }) => [styles.ctaWrap, (!canSubmit || !!busy) && { opacity: 0.6 }, pressed && { transform: [{ scale: 0.98 }] }]}>
          <LinearGradient colors={[colors.askGreen, colors.askGreenLight]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
            {busy === "submit" ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Text style={styles.ctaText}>{withBrand(ctaLabel, "soft")}</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
              </>
            )}
          </LinearGradient>
        </Pressable>

        {mode === "reset" ? (
          <Pressable testID="reset-back-button" onPress={() => { setMode("login"); setCode(""); setPassword(""); }} style={styles.backLink}>
            <Text style={styles.backText}>← {t("back")}</Text>
          </Pressable>
        ) : (
          <>
            {googleEnabled ? (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.line} />
                  <Text style={styles.dividerText}>{t("orVia").toUpperCase()}</Text>
                  <View style={styles.line} />
                </View>
                <Pressable testID="google-signin-button" onPress={() => run("google", signIn)} disabled={!!busy} style={({ pressed }) => [styles.social, pressed && { opacity: 0.8 }]}>
                  {busy === "google" ? <ActivityIndicator color={colors.brandPrimaryText} /> : (
                    <>
                      <Ionicons name="logo-google" size={22} color="#4285F4" />
                      <Text style={styles.socialText}>{t("google")}</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : null}
            <Text style={styles.disclaimer} testID="login-disclaimer">{withBrand(t("authDisclaimer"))}</Text>
            <SiteFooter testID="login-footer" />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const StyleFill = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.askBgMid },
  scroll: { paddingHorizontal: 20, gap: 20, width: "100%", maxWidth: 520, alignSelf: "center" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  brandBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 12, backgroundColor: c.askOrangeTint, borderWidth: 1, borderColor: c.askBorder },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.onlineDot },
  brandBadgeText: { color: c.onSurface, fontWeight: "800", fontSize: 12 },
  langs: { flexDirection: "row", gap: 4, padding: 3, borderRadius: 12, backgroundColor: c.askField, borderWidth: 1, borderColor: c.askBorder },
  lang: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 32, borderRadius: 9, borderWidth: 1, borderColor: "transparent" },
  langActive: { backgroundColor: c.askOrange, borderColor: c.askOrange },
  flag: { fontSize: 13 },
  langText: { color: c.askNavy, fontWeight: "800", fontSize: 12 },
  langTextActive: { color: c.onAccent },
  logoBlock: { alignItems: "center", gap: 12, marginTop: 20 },
  logo: { width: 210, aspectRatio: 630 / 363 },
  motto: { color: c.askNavy, fontWeight: "700", fontSize: 15, textAlign: "center" },
  tagline: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: c.askOrangeTint, borderWidth: 1, borderColor: c.askBorder },
  taglineText: { color: c.askOrange, fontWeight: "700", fontSize: 13 },
  tabs: { flexDirection: "row", gap: 8, padding: 4, borderRadius: 16, backgroundColor: c.askField, borderWidth: 1, borderColor: c.askBorder },
  tab: { flex: 1, minHeight: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: c.askBorder, backgroundColor: c.askField },
  tabActive: { backgroundColor: c.askOrange, borderColor: c.askOrange, ...fx("buttonShadow") },
  tabText: { color: c.askNavy, fontWeight: "700", fontSize: 15 },
  tabTextActive: { color: c.onAccent, fontWeight: "800" },
  resetHead: { alignItems: "center" },
  resetTitle: { color: c.askNavy, fontSize: 22, fontWeight: "900" },
  form: { gap: 12 },
  field: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.askField, borderWidth: 1, borderColor: c.askBorder },
  fieldFocus: { borderColor: c.askOrange },
  fieldInput: { flex: 1, fontSize: 16, color: c.askInk, fontWeight: "500", paddingVertical: 14 },
  eye: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  hint: { color: c.muted, fontSize: 12, marginLeft: 4 },
  forgot: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center" },
  forgotText: { color: c.askOrange, fontWeight: "700", fontSize: 13 },
  ctaWrap: { borderRadius: 999, ...fx("buttonShadow") },
  cta: { minHeight: 60, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 20 },
  ctaText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 15, letterSpacing: 1.2, textTransform: "uppercase" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  line: { flex: 1, height: 1, backgroundColor: c.askBorder },
  dividerText: { color: c.muted, fontWeight: "800", fontSize: 11, letterSpacing: 1.2 },
  social: { minHeight: 54, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: c.askField, borderWidth: 1.5, borderColor: c.askBorder },
  socialText: { color: c.askInk, fontWeight: "700", fontSize: 16 },
  disclaimer: { color: c.muted, fontSize: 11, textAlign: "center", lineHeight: 16, marginTop: -8 },
  backLink: { alignSelf: "center", minHeight: 44, justifyContent: "center" },
  backText: { color: c.askOrange, fontWeight: "700", fontSize: 14 },
}));
