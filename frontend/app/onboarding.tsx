import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth, User } from "@/src/auth";
import { CONTRACT_TYPES, INDUSTRIES } from "@/src/components/ProfileForm";
import { useToast } from "@/src/components/Toast";
import { Locale, StringKey, useT } from "@/src/i18n";
import { makeStyles, useTheme } from "@/src/theme";

type Key = "name" | "address" | "phone" | "employer" | "industry" | "job_title" | "contract_type" | "start_date" | "workplace_address" | "hr_email";
type Step = { k: Key; q: StringKey; ph?: string; kb?: any; re?: RegExp; err?: StringKey; options?: readonly string[]; chipsOnly?: boolean; optional?: boolean };
type Msg = { from: "elon"; key: StringKey; vars?: Record<string, string> } | { from: "me"; text: string };

const STEPS: Step[] = [
  { k: "name", q: "ob_name", ph: "Artur Kowalski" },
  { k: "address", q: "ob_address", ph: "12 High Street, Dartford DA1 1AA" },
  { k: "phone", q: "ob_phone", ph: "+44 7700 900123", kb: "phone-pad", re: /^\+\d{1,3}\s?[\d\s]{6,}$/, err: "ob_invalidPhone" },
  { k: "employer", q: "ob_employer", ph: "Amazon UK Services Ltd" },
  { k: "industry", q: "ob_industry", options: INDUSTRIES },
  { k: "job_title", q: "ob_job", ph: "Warehouse Operative" },
  { k: "contract_type", q: "ob_contract", options: CONTRACT_TYPES, chipsOnly: true },
  { k: "start_date", q: "ob_start", ph: "2024-01-12", kb: "numbers-and-punctuation", re: /^\d{4}-\d{2}-\d{2}$/, err: "ob_invalidDate" },
  { k: "workplace_address", q: "ob_workplace", ph: "London Road, Tilbury RM18 7AN" },
  { k: "hr_email", q: "ob_hr", ph: "hr@company.co.uk", kb: "email-address", re: /^\S+@\S+\.\S+$/, err: "invalidEmail", optional: true },
];
const DOCS = STEPS.length;
const LANGS: { id: Locale; flag: string; label: string }[] = [
  { id: "pl", flag: "🇵🇱", label: "Polski" },
  { id: "en", flag: "🇬🇧", label: "English" },
  { id: "ro", flag: "🇷🇴", label: "Română" },
];

export default function Onboarding() {
  const { user, setUser, signOut, setLocale } = useAuth();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [step, setStep] = useState(-1);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickLang, setPickLang] = useState(false);

  const chooseLang = async (l: (typeof LANGS)[number]) => {
    setPickLang(false);
    setMsgs((m) => [...m, { from: "me", text: `${l.flag} ${l.label}` }, { from: "elon", key: "ob_hello" }]);
    try {
      await setLocale(l.id);
    } catch {}
    ask(0);
  };

  const ask = (i: number, name?: string) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { from: "elon", key: i === DOCS ? "ob_docs" : STEPS[i].q, vars: { name: (name ?? user?.name ?? "").split(" ")[0] } }]);
      setStep(i);
      const k = STEPS[i]?.k;
      const pre = k ? (((user as any)?.[k] as string) ?? "") : "";
      setValue(pre || (k === "phone" ? "+44 " : ""));
    }, 700);
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs([{ from: "elon", key: "ob_pickLang" }]);
      setPickLang(true);
    }, 500);
  }, []);

  const answer = async (raw: string, label?: string) => {
    const s = STEPS[step];
    const v = raw.trim();
    if (!v && !s.optional) return;
    if (v && s.re && !s.re.test(v)) {
      toast(t(s.err!), "error");
      return;
    }
    setBusy(true);
    try {
      if (v) setUser(await api<User>("/profile", { method: "PUT", body: { [s.k]: v } }));
      setMsgs((m) => [...m, { from: "me", text: v ? label ?? v : t("skip") }]);
      setValue("");
      setStep(-1);
      ask(step + 1, s.k === "name" ? v : undefined);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (goDocs: boolean) => {
    setBusy(true);
    try {
      setUser(await api<User>("/profile", { method: "PUT", body: { onboarded: true } }));
      if (goDocs) setTimeout(() => router.push("/profile?tab=docs"), 300);
    } catch (e: any) {
      toast(e.message, "error");
      setBusy(false);
    }
  };

  const cur = step >= 0 && step < DOCS ? STEPS[step] : null;
  const optLabel = (o: string) => (cur?.k === "contract_type" ? t(`ct_${o}` as any) : o);

  return (
    <View style={styles.root} testID="onboarding-screen">
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <View style={styles.avatar}><Text style={styles.avatarText}>E</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} testID="onboarding-title">{t("elonTitle")}</Text>
          <Text style={styles.sub}>{t("wizardTitle")} · {Math.min(Math.max(step, 0), DOCS)}/{DOCS}</Text>
        </View>
        <Pressable testID="onboarding-skip-button" onPress={() => finish(false)} disabled={busy} hitSlop={8} style={styles.headBtn}>
          <Text style={styles.headBtnText}>{t("ob_skipAll")}</Text>
        </Pressable>
        <Pressable testID="onboarding-logout-button" onPress={signOut} hitSlop={8} style={styles.iconBtn} accessibilityLabel={t("logout")}>
          <Ionicons name="log-out-outline" size={22} color={colors.onBrandSecondary} />
        </Pressable>
      </View>
      <View style={styles.progress}><View style={[styles.progressFill, { width: `${(Math.max(step, 0) / DOCS) * 100}%` }]} /></View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {msgs.map((m, i) => (
            <Animated.View key={i} entering={FadeInUp.duration(250)} style={[styles.bubble, m.from === "elon" ? styles.ai : styles.me]} testID={m.from === "elon" ? "onboarding-elon-message" : "onboarding-user-message"}>
              <Text style={m.from === "elon" ? styles.aiText : styles.meText}>{m.from === "elon" ? t(m.key, m.vars) : m.text}</Text>
            </Animated.View>
          ))}
          {pickLang && (
            <View style={styles.chips} testID="onboarding-language-picker">
              {LANGS.map((l) => (
                <Pressable key={l.id} testID={`onboarding-lang-${l.id}`} onPress={() => chooseLang(l)} style={({ pressed }) => [styles.flag, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.flagEmoji}>{l.flag}</Text>
                  <Text style={styles.chipText}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {typing && (
            <View style={[styles.bubble, styles.ai]} testID="onboarding-typing">
              <ActivityIndicator size="small" color={colors.heritageGreen} />
            </View>
          )}
          {cur?.options && !typing && (
            <View style={styles.chips}>
              {cur.options.map((o) => (
                <Pressable key={o} testID={`onboarding-option-${o.replace(/\W+/g, "-").toLowerCase()}`} onPress={() => answer(o, optLabel(o))} disabled={busy} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.8 }]}>
                  <Text style={styles.chipText}>{optLabel(o)}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {step === DOCS && !typing && (
            <View style={styles.docBtns}>
              <Pressable testID="onboarding-docs-now" onPress={() => finish(true)} disabled={busy} style={styles.cta}>
                <Ionicons name="document-attach-outline" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.ctaText}>{t("ob_docsNow")}</Text>
              </Pressable>
              <Pressable testID="onboarding-docs-later" onPress={() => finish(false)} disabled={busy} style={styles.secondary}>
                <Text style={styles.secondaryText}>{t("ob_docsLater")}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {cur && !cur.chipsOnly && !typing && (
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {cur.optional && (
              <Pressable testID="onboarding-step-skip" onPress={() => answer("")} disabled={busy} style={styles.skipStep}>
                <Text style={styles.skipStepText}>{t("skip")}</Text>
              </Pressable>
            )}
            <TextInput
              testID={`onboarding-${cur.k}-input`}
              value={value}
              onChangeText={setValue}
              placeholder={cur.ph ?? t("ob_answer")}
              placeholderTextColor={colors.muted}
              keyboardType={cur.kb}
              autoCapitalize={cur.kb === "email-address" ? "none" : "sentences"}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={() => answer(value)}
              style={styles.input}
            />
            <Pressable testID="onboarding-send-button" onPress={() => answer(value)} disabled={busy || !value.trim()} style={[styles.send, (!value.trim() || busy) && { opacity: 0.5 }]} accessibilityLabel="Send">
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> : <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.heritageCream },
  head: { backgroundColor: c.heritageGreen, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.heritageOrange, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 16 },
  title: { color: c.onBrandSecondary, fontSize: 17, fontWeight: "900" },
  sub: { color: c.onBrandSecondary, opacity: 0.75, fontSize: 12, marginTop: 2 },
  headBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  headBtnText: { color: c.onBrandSecondary, fontWeight: "700", fontSize: 13, opacity: 0.85 },
  iconBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 },
  progress: { height: 4, backgroundColor: c.heritageGreenDeep },
  progressFill: { height: 4, backgroundColor: c.heritageOrange },
  list: { padding: 16, gap: 10 },
  bubble: { maxWidth: "86%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  ai: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderTopLeftRadius: 4, borderWidth: 1, borderColor: c.border },
  me: { alignSelf: "flex-end", backgroundColor: c.heritageGreen, borderTopRightRadius: 4 },
  aiText: { color: c.onSurface, fontSize: 15, lineHeight: 21 },
  meText: { color: c.onBrandSecondary, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  flag: { alignItems: "center", gap: 4, width: 96, paddingVertical: 12, borderRadius: 16, borderWidth: 1.5, borderColor: c.heritageOrange, backgroundColor: c.surfaceSecondary },
  flagEmoji: { fontSize: 32 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", borderWidth: 1.5, borderColor: c.heritageOrange, backgroundColor: c.heritageOrangeSoft },
  chipText: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  docBtns: { gap: 10, marginTop: 6 },
  cta: { minHeight: 50, borderRadius: 12, backgroundColor: c.heritageOrange, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, fontSize: 14 },
  secondary: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 14 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderColor: c.border },
  input: { flex: 1, minHeight: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: c.surfaceTertiary, color: c.onSurface, fontSize: 15 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.heritageOrange, alignItems: "center", justifyContent: "center" },
  skipStep: { minHeight: 44, justifyContent: "center", paddingHorizontal: 6 },
  skipStepText: { color: c.muted, fontWeight: "700", fontSize: 13 },
}));
