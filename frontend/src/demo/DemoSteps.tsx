// The five demo steps. Pure UI on bundled sample data: no API calls, no storage, no AI.
// Look and feel reuse the real screens (chat bubbles and case card from ChatView, note tiles from
// NotesPanel, the membership card and QrCode from the Profile), all colours from theme tokens.
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { cancelAnimation, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { withBrand } from "@/src/components/BrandName";
import { LANG_FLAGS } from "@/src/components/LanguageSwitch";
import { QrCode } from "@/src/components/QrCode";
import type { Locale } from "@/src/i18n";
import { fx, makeStyles, useTheme } from "@/src/theme";

import { DEMO_ACCOUNT_ID, DEMO_ACCOUNT_ID_SPACED, DEMO_EMPLOYER, DEMO_LOCALES, DEMO_NAME, DemoKey, dt, LETTER_EN, LETTER_TR } from "./content";

export type StepProps = { locale: Locale; reduce: boolean; wide: boolean; onUnlock: () => void };

const LANG_LABEL: Record<Locale, string> = { pl: "Polski", en: "English", ro: "Română" };

/* ------------------------------------------------------------------ shared bits */

export function DemoLock({ text, onUnlock, locale, testID }: { text: string; onUnlock: () => void; locale: Locale; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onUnlock} accessibilityRole="button" accessibilityLabel={`${text}. ${dt(locale, "lockGeneric")}`} testID={testID}
      style={({ pressed }) => [styles.lock, pressed && styles.pressed]}>
      <Ionicons name="lock-closed" size={18} color={colors.gold} />
      <Text style={styles.lockText}>{text}</Text>
      <View style={styles.lockCta}><Text style={styles.lockCtaText}>{dt(locale, "lockGeneric")}</Text></View>
    </Pressable>
  );
}

function StepHead({ title, caption }: { title: string; caption?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stepHead}>
      <Text style={styles.stepTitle} accessibilityRole="header">{title}</Text>
      {!!caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

function ElonTag() {
  const styles = useStyles();
  return (
    <View style={styles.senderRow}>
      <Image source={require("@/assets/brand/robot-header.png")} style={styles.avatar} contentFit="contain" accessible={false} alt="" />
      <Text style={styles.sender}>Elon</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ 1. greeting */

export function StepGreeting({ locale, reduce, onLocale }: StepProps & { onLocale: (l: Locale) => void }) {
  const styles = useStyles();
  return (
    <View style={styles.stack} testID="demo-step-1">
      <View style={styles.hero}>
        <Image source={require("@/assets/brand/robot-header.png")} style={styles.heroRobot} contentFit="contain" accessible={false} alt="" />
        <Text style={styles.heroTitle} accessibilityRole="header">{dt(locale, "s1Title")}</Text>
      </View>
      <Animated.View entering={reduce ? undefined : FadeIn.duration(350).delay(150)} style={[styles.bubble, styles.ai, styles.bubbleWide]} testID="demo-greeting">
        <ElonTag />
        <Text style={styles.aiText}>{withBrand(dt(locale, "s1Text"), "soft")}</Text>
      </Animated.View>

      <View style={styles.langBlock}>
        <Text style={styles.label}>{dt(locale, "langTitle")}</Text>
        <View style={styles.langRow} testID="demo-language-switch">
          {DEMO_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <Pressable key={l} testID={`demo-lang-${l}`} onPress={() => onLocale(l)} accessibilityRole="button" accessibilityState={{ selected: active }}
                style={[styles.langSeg, active && styles.langSegActive, active && fx("languageActive")]}>
                <Text style={styles.flag}>{LANG_FLAGS[l]}</Text>
                <Text style={[styles.langLabel, active && styles.langLabelActive]} numberOfLines={1}>{LANG_LABEL[l]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.note}>{dt(locale, "s1Note")}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ 2. chat */

function TypingDots({ reduce, label }: { reduce: boolean; label: string }) {
  const styles = useStyles();
  const a = useSharedValue(0.35);
  const b = useSharedValue(0.35);
  const c = useSharedValue(0.35);
  useEffect(() => {
    if (reduce) return;
    const pulse = (v: typeof a, d: number) => {
      v.value = withDelay(d, withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0.35, { duration: 300 })), -1));
    };
    pulse(a, 0);
    pulse(b, 150);
    pulse(c, 300);
    return () => {
      cancelAnimation(a);
      cancelAnimation(b);
      cancelAnimation(c);
    };
  }, [reduce, a, b, c]);
  const sa = useAnimatedStyle(() => ({ opacity: a.value }));
  const sb = useAnimatedStyle(() => ({ opacity: b.value }));
  const sc = useAnimatedStyle(() => ({ opacity: c.value }));
  return (
    <View style={[styles.bubble, styles.ai, styles.typing]} testID="demo-typing" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.dot, sa]} />
      <Animated.View style={[styles.dot, sb]} />
      <Animated.View style={[styles.dot, sc]} />
    </View>
  );
}

// phase: 0 Marek#1 · 1 typing · 2 Elon#1 typing out · 3 Marek#2 · 4 typing · 5 Elon#2 typing out · 6 done
const DONE = 6;

export function StepChat({ locale, reduce, onUnlock }: StepProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [run, setRun] = useState(0);
  const [rawPhase, setPhase] = useState(0);
  // Reduced motion: the whole conversation is shown at once, no typing.
  const phase = reduce ? DONE : rawPhase;
  const [words, setWords] = useState(0);
  const e1 = useMemo(() => dt(locale, "elon1").split(" "), [locale]);
  const e2 = useMemo(() => dt(locale, "elon2").split(" "), [locale]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();
    if (reduce) return clear;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    if (phase === 0) at(550, () => setPhase(1));
    else if (phase === 1 || phase === 4) at(phase === 1 ? 950 : 800, () => {
      setWords(0);
      setPhase(phase + 1);
    });
    else if (phase === 2 || phase === 5) {
      const total = (phase === 2 ? e1 : e2).length;
      if (words < total) at(55, () => setWords((w) => w + 1));
      else at(650, () => setPhase(phase + 1));
    } else if (phase === 3) at(550, () => setPhase(4));
    return clear;
  }, [phase, words, reduce, e1, e2, run]);

  const replay = () => {
    setWords(0);
    setPhase(0);
    setRun((r) => r + 1);
  };
  const enter = reduce ? undefined : FadeIn.duration(250);
  const text = (all: string[], p: number) => (phase === p ? all.slice(0, words).join(" ") : all.join(" "));

  return (
    <View style={styles.stack} testID="demo-step-2">
      <StepHead title={dt(locale, "s2Title")} caption={dt(locale, "s2Caption")} />
      <View style={styles.chat} accessibilityLiveRegion="polite" testID="demo-chat">
        <Animated.View entering={enter} style={[styles.bubble, styles.user]} testID="demo-msg-marek-1">
          <Text style={styles.userName}>Marek</Text>
          <Text style={styles.userText}>{dt(locale, "marek1")}</Text>
        </Animated.View>
        {(phase === 1) && <TypingDots reduce={reduce} label={dt(locale, "typing")} />}
        {phase >= 2 && (
          <Animated.View entering={enter} style={[styles.bubble, styles.ai]} testID="demo-msg-elon-1">
            <ElonTag />
            <Text style={styles.aiText}>{text(e1, 2)}</Text>
          </Animated.View>
        )}
        {phase >= 3 && (
          <Animated.View entering={enter} style={[styles.bubble, styles.user]} testID="demo-msg-marek-2">
            <Text style={styles.userName}>Marek</Text>
            <Text style={styles.userText}>{dt(locale, "marek2")}</Text>
          </Animated.View>
        )}
        {phase === 4 && <TypingDots reduce={reduce} label={dt(locale, "typing")} />}
        {phase >= 5 && (
          <Animated.View entering={enter} style={[styles.bubble, styles.ai]} testID="demo-msg-elon-2">
            <ElonTag />
            <Text style={styles.aiText}>{text(e2, 5)}</Text>
          </Animated.View>
        )}
      </View>
      {phase === DONE && (
        <Pressable onPress={replay} testID="demo-replay" accessibilityRole="button" style={styles.replay} hitSlop={6}>
          <Ionicons name="refresh" size={14} color={colors.brandPrimaryText} />
          <Text style={styles.replayText}>{dt(locale, "replay")}</Text>
        </Pressable>
      )}
      <Pressable onPress={onUnlock} testID="demo-composer-locked" accessibilityRole="button" accessibilityLabel={`${dt(locale, "composerLocked")}. ${dt(locale, "lockGeneric")}`}
        style={({ pressed }) => [styles.composer, pressed && styles.pressed]}>
        <Text style={styles.composerText} numberOfLines={1}>{dt(locale, "composerLocked")}</Text>
        <View style={styles.composerSend}><Ionicons name="lock-closed" size={18} color={colors.onAccent} /></View>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ 3. case */

export function StepCase({ locale, onUnlock }: StepProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const items: { k: DemoKey; d: DemoKey; done: boolean }[] = [
    { k: "tl1", d: "tl1d", done: true },
    { k: "tl2", d: "tl2d", done: true },
    { k: "tl3", d: "tl3d", done: true },
    { k: "tl4", d: "tl4d", done: false },
  ];
  return (
    <View style={styles.stack} testID="demo-step-3">
      <StepHead title={dt(locale, "s3Title")} caption={dt(locale, "s3Caption")} />
      <View style={styles.caseCard} testID="demo-case-card">
        <View style={styles.caseTop}>
          <View style={styles.pill} testID="demo-case-status">
            <View style={styles.pillDot} />
            <Text style={styles.pillText}>{dt(locale, "caseStatus")}</Text>
          </View>
          <Text style={styles.demoBadge}>{dt(locale, "demoTag")}</Text>
        </View>
        <Text style={styles.caseTitle}>{dt(locale, "caseTitle")}</Text>
        <View style={styles.caseSector}>
          <Ionicons name="business-outline" size={14} color={colors.muted} />
          <Text style={styles.caseSectorText} numberOfLines={1}>{DEMO_EMPLOYER} · {dt(locale, "caseSector")}</Text>
        </View>

        <Text style={[styles.label, { marginTop: 6 }]}>{dt(locale, "timeline").toUpperCase()}</Text>
        <View testID="demo-timeline">
          {items.map((it, i) => (
            <View key={it.k} style={styles.tlRow}>
              <View style={styles.tlRail}>
                <View style={[styles.tlDot, it.done ? styles.tlDotDone : styles.tlDotNow]}>
                  {it.done ? <Ionicons name="checkmark" size={12} color={colors.onSuccess} /> : <Ionicons name="time-outline" size={12} color={colors.onAccent} />}
                </View>
                {i < items.length - 1 && <View style={[styles.tlLine, it.done && styles.tlLineDone]} />}
              </View>
              <View style={styles.tlBody}>
                <Text style={[styles.tlText, !it.done && styles.tlTextNow]}>{dt(locale, it.k)}</Text>
                <Text style={styles.tlDate}>{dt(locale, it.d)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.reminder} testID="demo-reminder">
          <Ionicons name="alarm-outline" size={20} color={colors.warning} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.reminderText}>{dt(locale, "reminder")}</Text>
            <Text style={styles.reminderSub}>{dt(locale, "reminderSub")}</Text>
          </View>
        </View>
      </View>
      <DemoLock text={dt(locale, "lockCase")} onUnlock={onUnlock} locale={locale} testID="demo-lock-case" />
    </View>
  );
}

/* ------------------------------------------------------------------ 4. letter */

function Paper({ title, body, testID, right }: { title: string; body: string; testID: string; right?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.paperWrap} testID={testID}>
      <View style={styles.paperHead}>
        <Text style={styles.paperLabel}>{title.toUpperCase()}</Text>
        {right}
      </View>
      <View style={styles.paper}>
        <Text style={styles.paperText} selectable={false}>{body}</Text>
      </View>
    </View>
  );
}

export function StepLetter({ locale, wide, onUnlock }: StepProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tr = LETTER_TR[locale];
  const [view, setView] = useState<"en" | "tr">("en");
  const copyBtn = (
    <Pressable onPress={onUnlock} testID="demo-copy-locked" accessibilityRole="button" accessibilityLabel={`${dt(locale, "copy")}. ${dt(locale, "lockGeneric")}`}
      style={({ pressed }) => [styles.copy, pressed && styles.pressed]} hitSlop={6}>
      <Ionicons name="lock-closed" size={13} color={colors.gold} />
      <Text style={styles.copyText}>{dt(locale, "copy")}</Text>
      <Text style={styles.copyPro}>PRO</Text>
    </Pressable>
  );
  return (
    <View style={styles.stack} testID="demo-step-4">
      <StepHead title={dt(locale, "s4Title")} caption={dt(locale, "s4Caption")} />
      {tr && wide ? (
        <View style={styles.papersRow}>
          <View style={{ flex: 1 }}><Paper title={dt(locale, "original")} body={LETTER_EN} testID="demo-letter-en" right={copyBtn} /></View>
          <View style={{ flex: 1 }}><Paper title={dt(locale, "translation")} body={tr} testID="demo-letter-tr" /></View>
        </View>
      ) : tr ? (
        <>
          <View style={styles.seg} accessibilityRole="tablist" testID="demo-letter-toggle">
            {(["en", "tr"] as const).map((v) => (
              <Pressable key={v} onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: view === v }} testID={`demo-letter-tab-${v}`}
                style={[styles.segBtn, view === v && styles.segBtnActive]}>
                <Text style={[styles.segText, view === v && styles.segTextActive]}>{dt(locale, v === "en" ? "original" : "translation")}</Text>
              </Pressable>
            ))}
          </View>
          {view === "en" ? <Paper title={dt(locale, "original")} body={LETTER_EN} testID="demo-letter-en" right={copyBtn} />
            : <Paper title={dt(locale, "translation")} body={tr} testID="demo-letter-tr" right={copyBtn} />}
        </>
      ) : (
        <Paper title={dt(locale, "original")} body={LETTER_EN} testID="demo-letter-en" right={copyBtn} />
      )}
      <DemoLock text={dt(locale, "lockCopy")} onUnlock={onUnlock} locale={locale} testID="demo-lock-copy" />
    </View>
  );
}

/* ------------------------------------------------------------------ 5. notes + card + CTA */

export function StepPro({ locale, onUnlock }: StepProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const notes: [DemoKey, DemoKey][] = [["n1t", "n1b"], ["n2t", "n2b"], ["n3t", "n3b"]];
  return (
    <View style={styles.stack} testID="demo-step-5">
      <StepHead title={dt(locale, "s5Title")} caption={dt(locale, "s5Caption")} />
      <Text style={styles.label}>{dt(locale, "notes").toUpperCase()}</Text>
      <View style={styles.grid} testID="demo-notes">
        {notes.map(([tk, bk]) => (
          <View key={tk} style={styles.tile} testID={`demo-note-${tk}`}>
            <View style={styles.tileAccent} />
            <Text style={styles.tileTitle} numberOfLines={2}>{dt(locale, tk)}</Text>
            <Text style={styles.tileBody} numberOfLines={4}>{dt(locale, bk)}</Text>
          </View>
        ))}
        <Pressable onPress={onUnlock} testID="demo-note-add-locked" accessibilityRole="button" accessibilityLabel={`${dt(locale, "noteAdd")}. ${dt(locale, "lockGeneric")}`}
          style={({ pressed }) => [styles.tile, styles.addTile, pressed && styles.pressed]}>
          <Ionicons name="lock-closed" size={24} color={colors.askOrange} />
          <Text style={styles.addText}>{dt(locale, "noteAdd")}</Text>
        </Pressable>
      </View>

      <View style={[styles.cardOuter, fx("profileCardGlow")]} testID="demo-member-card">
        <LinearGradient colors={[colors.surfaceSecondary, colors.brand, colors.surfaceSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
          <View style={styles.cardStripe} />
          <Image source={require("@/assets/brand/robot-watermark.png")} style={styles.watermark} contentFit="contain" accessible={false} alt="" />
          <Text style={styles.cardKicker} numberOfLines={1}>{withBrand(dt(locale, "card"), "soft", (s) => s.toUpperCase())}</Text>
          <View style={styles.cardRow}>
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <Text style={styles.cardName} numberOfLines={2}>{DEMO_NAME.split(" ")[0]} <Text style={styles.cardSurname}>{DEMO_NAME.split(" ")[1].toUpperCase()}</Text></Text>
              <View style={styles.badges}>
                <View style={[styles.badge, styles.badgePro, fx("chipProGlow")]}><Text style={styles.badgeProText}>★ PRO</Text></View>
                <View style={[styles.badge, styles.badgeGlass]}><Text style={styles.badgeText}>{LANG_FLAGS.pl} PL</Text></View>
                <View style={[styles.badge, styles.badgeGlass]}><Text style={styles.badgeText}>{dt(locale, "demoTag")}</Text></View>
              </View>
              <View>
                <Text style={styles.cardIdLabel}>{dt(locale, "cardId").toUpperCase()}</Text>
                <Text style={styles.cardId} testID="demo-card-id">{DEMO_ACCOUNT_ID_SPACED}</Text>
              </View>
              <Text style={styles.cardSince}>{dt(locale, "cardSince")}</Text>
            </View>
            <View style={styles.qrBox}><QrCode value={DEMO_ACCOUNT_ID} size={92} testID="demo-qr" accessibilityLabel={dt(locale, "cardQr")} /></View>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.ctaBox} testID="demo-final-cta">
        <Text style={styles.ctaTitle}>{dt(locale, "ctaTitle")}</Text>
        <Text style={styles.ctaIncludes}>{dt(locale, "ctaIncludes")}</Text>
        <Text style={styles.ctaHonest} testID="demo-cta-honest">{dt(locale, "ctaHonest")}</Text>
        <Pressable onPress={onUnlock} testID="demo-cta-register" accessibilityRole="button" style={({ pressed }) => [styles.primary, fx("buttonShadow"), pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{dt(locale, "ctaBtn")}</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ styles */

const useStyles = makeStyles((c) => ({
  stack: { gap: 14 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  stepHead: { gap: 4 },
  stepTitle: { color: c.onSurface, fontSize: 22, fontWeight: "900", lineHeight: 28 },
  caption: { color: c.warning, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  label: { color: c.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  note: { color: c.footnote, fontSize: 13, textAlign: "center" },

  hero: { alignItems: "center", gap: 8, marginTop: 4 },
  heroRobot: { width: 88, height: 88 },
  heroTitle: { color: c.onSurface, fontSize: 26, fontWeight: "900", textAlign: "center" },
  langBlock: { gap: 8 },
  langRow: { flexDirection: "row", gap: 8 },
  langSeg: { flex: 1, minWidth: 0, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: 4 },
  langSegActive: { backgroundColor: c.heritageOrangeSoft, borderColor: c.askOrange },
  flag: { fontSize: 14 },
  langLabel: { color: c.brandSecondaryText, fontWeight: "600", fontSize: 14, flexShrink: 1 },
  langLabelActive: { color: c.askInk, fontWeight: "800" },

  primary: { minHeight: 54, borderRadius: 999, backgroundColor: c.askOrange, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 20 },
  primaryText: { color: c.onAccent, fontWeight: "900", fontSize: 16, textAlign: "center", flexShrink: 1 },

  // chat (same look as ChatView)
  chat: { gap: 12, padding: 12, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, minHeight: 300 },
  bubble: { maxWidth: "88%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleWide: { maxWidth: "100%" },
  ai: { alignSelf: "flex-start", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 6 },
  user: { alignSelf: "flex-end", backgroundColor: c.brandPrimary, borderBottomRightRadius: 6 },
  senderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  avatar: { width: 28, height: 28 },
  sender: { color: c.brandPrimaryText, fontWeight: "900", fontSize: 12 },
  aiText: { color: c.onSurface, fontSize: 15, lineHeight: 22, fontWeight: "500" },
  userName: { color: c.onBrandSecondaryMuted, fontSize: 11, fontWeight: "900", marginBottom: 3 },
  userText: { color: c.onBrandPrimary, fontSize: 15, lineHeight: 22, fontWeight: "500" },
  typing: { flexDirection: "row", gap: 6, paddingVertical: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.brandPrimaryText },
  replay: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 32 },
  replayText: { color: c.brandPrimaryText, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 6, minHeight: 52, borderRadius: 26, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong },
  composerText: { flex: 1, color: c.muted, fontSize: 15 },
  composerSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center" },

  // lock bar (same look as ProLock)
  lock: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.goldSoft, borderWidth: 1, borderColor: c.gold },
  lockText: { flex: 1, color: c.onSurface, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  lockCta: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.heritageOrange, justifyContent: "center" },
  lockCtaText: { color: c.onAccent, fontWeight: "800", fontSize: 12, textTransform: "uppercase" },

  // case card (same look as the case card in ChatView)
  caseCard: { backgroundColor: c.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4, borderLeftColor: c.askOrange, padding: 14, gap: 8 },
  caseTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  caseTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900", lineHeight: 24 },
  caseSector: { flexDirection: "row", alignItems: "center", gap: 6 },
  caseSectorText: { color: c.muted, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 999, alignSelf: "flex-start", backgroundColor: c.successSoft },
  pillDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.success },
  pillText: { fontSize: 12, fontWeight: "700", color: c.success },
  demoBadge: { color: c.onWarning, backgroundColor: c.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  tlRow: { flexDirection: "row", gap: 10 },
  tlRail: { alignItems: "center", width: 22 },
  tlDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tlDotDone: { backgroundColor: c.success },
  tlDotNow: { backgroundColor: c.askOrange },
  tlLine: { flex: 1, width: 2, minHeight: 16, backgroundColor: c.borderStrong },
  tlLineDone: { backgroundColor: c.success },
  tlBody: { flex: 1, paddingBottom: 12, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  tlText: { flex: 1, color: c.onSurface, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  tlTextNow: { color: c.warning, fontWeight: "800" },
  tlDate: { color: c.footnote, fontSize: 12, fontWeight: "700", lineHeight: 20 },
  reminder: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.warningSoft, borderWidth: 1, borderColor: c.brandTertiarySoft },
  reminderText: { color: c.warning, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  reminderSub: { color: c.onSurfaceTertiary, fontSize: 12.5, lineHeight: 17 },

  // letter
  papersRow: { flexDirection: "row", gap: 14, alignItems: "stretch" },
  paperWrap: { gap: 8, flex: 1 },
  paperHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 32 },
  paperLabel: { color: c.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  paper: { flex: 1, backgroundColor: c.surfaceInverse, borderRadius: 12, padding: 16, borderTopWidth: 4, borderTopColor: c.askOrange },
  paperText: { color: c.onSurfaceInverse, fontSize: 14, lineHeight: 21 },
  copy: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: c.gold, backgroundColor: c.goldSoft },
  copyText: { color: c.onSurface, fontSize: 12, fontWeight: "800" },
  copyPro: { color: c.gold, fontSize: 10, fontWeight: "900" },
  seg: { flexDirection: "row", gap: 6, padding: 4, borderRadius: 14, backgroundColor: c.askField, borderWidth: 1, borderColor: c.askBorder },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: c.askOrange },
  segText: { color: c.askNavy, fontWeight: "700", fontSize: 13 },
  segTextActive: { color: c.onAccent, fontWeight: "900" },

  // notes (same look as NotesPanel tiles)
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tile: { width: "48%", minHeight: 96, backgroundColor: c.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 12, overflow: "hidden", gap: 4 },
  tileAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: c.askOrange },
  tileTitle: { color: c.warning, fontSize: 14.5, fontWeight: "800", lineHeight: 19, marginTop: 2 },
  tileBody: { color: c.onSurfaceTertiary, fontSize: 13, lineHeight: 18 },
  addTile: { alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.brandTertiarySoft, borderStyle: "dashed", borderColor: c.askOrange, borderWidth: 1.5 },
  addText: { color: c.askOrange, fontWeight: "800", fontSize: 14, textAlign: "center" },

  // membership card (same look as ProfileCard)
  cardOuter: { borderRadius: 20, overflow: "hidden" },
  cardBg: { padding: 16, gap: 12, overflow: "hidden" },
  cardStripe: { position: "absolute", left: 0, right: 0, top: 0, height: 4, backgroundColor: c.askOrange },
  watermark: { position: "absolute", right: -18, bottom: -22, width: 150, height: 150, opacity: 0.08 },
  cardKicker: { color: c.onBrandSecondaryMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  cardRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  cardName: { color: c.onSurface, fontSize: 22, fontWeight: "700" },
  cardSurname: { fontWeight: "900", letterSpacing: 0.5 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { paddingHorizontal: 9, height: 24, borderRadius: 999, justifyContent: "center" },
  badgePro: { backgroundColor: c.askOrange },
  badgeProText: { color: c.onAccent, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  badgeGlass: { backgroundColor: c.glassFill, borderWidth: 1, borderColor: c.glassBorder },
  badgeText: { color: c.onSurface, fontSize: 11, fontWeight: "800" },
  cardIdLabel: { color: c.footnote, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  cardId: { color: c.onSurface, fontSize: 15, fontWeight: "800", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  cardSince: { color: c.muted, fontSize: 12 },
  qrBox: { borderRadius: 6, overflow: "hidden" },

  ctaBox: { gap: 10, padding: 16, borderRadius: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.askOrange },
  ctaTitle: { color: c.onSurface, fontSize: 19, fontWeight: "900", lineHeight: 25 },
  ctaIncludes: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
  ctaHonest: { color: c.warning, fontSize: 13.5, lineHeight: 19, fontWeight: "600" },
}));
