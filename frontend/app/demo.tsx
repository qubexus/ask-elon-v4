// Public demo of ask Elon (/demo): reachable logged out and logged in (see app/_layout.tsx).
// Five steps on bundled sample data. It makes no API calls, writes nothing (no backend, no storage),
// calls no AI. Every CTA and lock leads to registration (logged out) or the PRO paywall (logged in).
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { BrandName, withBrand } from "@/src/components/BrandName";
import { DEMO_STEPS, detectDemoLocale, dt } from "@/src/demo/content";
import { StepCase, StepChat, StepGreeting, StepLetter, StepPro, StepProps } from "@/src/demo/DemoSteps";
import type { Locale } from "@/src/i18n";
import { useReduceMotion } from "@/src/motion";
import { fx, makeStyles, useTheme } from "@/src/theme";

const WIDE = 760;

export default function Demo() {
  const params = useLocalSearchParams<{ lang?: string; step?: string }>();
  const { user } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const reduce = useReduceMotion() === true;
  const [locale, setLocale] = useState<Locale>(() => detectDemoLocale(params.lang));
  const [step, setStep] = useState(() => {
    const s = parseInt(String(params.step ?? ""), 10);
    return s >= 1 && s <= DEMO_STEPS ? s - 1 : 0;
  });
  const scrollRef = useRef<ScrollView>(null);

  // Keep <html lang> in step with the demo language (screen readers, translation prompts).
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const go = useCallback((n: number) => {
    setStep(Math.max(0, Math.min(DEMO_STEPS - 1, n)));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  // Every CTA / lock: logged out -> create account (in the demo language); logged in -> PRO paywall.
  // Navigation only: nothing is sent or saved here (the language is just passed in the URL).
  const unlock = useCallback(() => {
    if (!user) router.replace({ pathname: "/login", params: { mode: "register", lang: locale } });
    else if (user.onboarded === false) router.replace("/onboarding");
    else router.push("/paywall");
  }, [user, locale]);

  const exit = () => {
    if (router.canGoBack()) router.back();
    else router.replace(user ? "/" : "/login");
  };

  const last = step === DEMO_STEPS - 1;
  const props: StepProps = { locale, reduce, wide, onUnlock: unlock };
  const body = [
    <StepGreeting key="1" {...props} onLocale={setLocale} />,
    <StepChat key={`2-${locale}`} {...props} />,
    <StepCase key="3" {...props} />,
    <StepLetter key="4" {...props} />,
    <StepPro key="5" {...props} />,
  ][step];

  return (
    <View style={styles.root} testID="demo-screen">
      <Head><title>{dt(locale, "pageTitle")}</title></Head>
      <LinearGradient colors={[colors.askBgTop, colors.askBgMid, colors.askBgBottom]} locations={[0, 0.35, 0.8]} style={styles.fill} />

      <View style={[styles.banner, { paddingTop: insets.top + 6 }]} testID="demo-banner" accessibilityRole="alert">
        <Ionicons name="flask-outline" size={15} color={colors.onWarning} />
        <Text style={styles.bannerText}>{dt(locale, "banner")}</Text>
      </View>

      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable onPress={exit} testID="demo-close" accessibilityRole="button" accessibilityLabel={dt(locale, "close")} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={styles.brandRow}>
            <BrandName style={styles.brand} />
            <Text style={styles.brandTag}>{dt(locale, "demoTag")}</Text>
          </View>
          {!last ? (
            <Pressable onPress={() => go(DEMO_STEPS - 1)} testID="demo-skip" accessibilityRole="button" hitSlop={8} style={styles.skip}>
              <Text style={styles.skipText}>{dt(locale, "skip")}</Text>
            </Pressable>
          ) : <View style={styles.skip} />}
        </View>
        <View style={styles.dots} testID="demo-progress" accessibilityRole="progressbar"
          accessibilityLabel={dt(locale, "stepOf", { n: step + 1, total: DEMO_STEPS })}
          accessibilityValue={{ min: 1, max: DEMO_STEPS, now: step + 1 }}>
          {Array.from({ length: DEMO_STEPS }, (_, i) => (
            <Pressable key={i} onPress={() => go(i)} testID={`demo-dot-${i + 1}`} hitSlop={6} accessibilityRole="button"
              accessibilityLabel={dt(locale, "stepOf", { n: i + 1, total: DEMO_STEPS })} accessibilityState={{ selected: i === step }}>
              <View style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone, i === step && fx("tabDot")]} />
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Animated.View key={step} entering={reduce ? undefined : FadeIn.duration(260)}
          style={[styles.content, { maxWidth: wide && step === 3 ? 980 : 600 }]}>
          {body}
        </Animated.View>
      </ScrollView>

      <View style={[styles.navBar, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.navInner}>
          {step > 0 && (
            <Pressable onPress={() => go(step - 1)} testID="demo-back" accessibilityRole="button" style={({ pressed }) => [styles.navBack, pressed && styles.pressed]}>
              <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
              <Text style={styles.navBackText}>{dt(locale, "back")}</Text>
            </Pressable>
          )}
          <Pressable onPress={last ? unlock : () => go(step + 1)} testID={last ? "demo-nav-cta" : step === 0 ? "demo-start" : "demo-next"} accessibilityRole="button"
            style={({ pressed }) => [styles.navNext, fx("buttonShadow"), pressed && styles.pressed]}>
            <Text style={styles.navNextText} numberOfLines={1}>{last ? dt(locale, "navCta") : step === 0 ? dt(locale, "s1Cta") : dt(locale, "next")}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
          </Pressable>
        </View>
        <Text style={styles.footer} testID="demo-footer">{withBrand(dt(locale, "footer"))}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  banner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 6, paddingHorizontal: 12, backgroundColor: c.warning },
  bannerText: { color: c.onWarning, fontSize: 13, fontWeight: "800" },
  header: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, gap: 6, borderBottomWidth: 1, borderBottomColor: c.headerBorder, backgroundColor: c.headerBg },
  headerInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 980, alignSelf: "center" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  brandTag: { color: c.onWarning, backgroundColor: c.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  skip: { minWidth: 64, minHeight: 44, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 4 },
  skipText: { color: c.askOrange, fontWeight: "800", fontSize: 14 },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, minHeight: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.borderStrong },
  dotDone: { backgroundColor: c.brandPrimaryText },
  dotActive: { width: 22, backgroundColor: c.askOrange },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24 },
  content: { width: "100%", alignSelf: "center" },
  navBar: { paddingHorizontal: 12, paddingTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: c.headerBorder, backgroundColor: c.tabBarBg },
  navInner: { flexDirection: "row", gap: 10, width: "100%", maxWidth: 600, alignSelf: "center" },
  navBack: { minHeight: 50, paddingHorizontal: 16, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: c.borderStrong },
  navBackText: { color: c.onSurface, fontWeight: "800", fontSize: 15 },
  navNext: { flex: 1, minHeight: 50, paddingHorizontal: 16, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.askOrange },
  navNextText: { color: c.onAccent, fontWeight: "900", fontSize: 15, flexShrink: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  footer: { color: c.footnote, fontSize: 11.5, textAlign: "center", lineHeight: 16 },
}));
