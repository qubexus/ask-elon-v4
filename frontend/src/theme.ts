// Design tokens for this app. Dark theme only, with the exact colours of the website askelon.uk.
//
// The keys match the "color" block of /app/design_guidelines.json. Fill the
// values from that file (or from the user's brand colors). Keep every key; do
// not add a second theme or colors file; do not write color literals in
// components.
//
// How the names work: a plain key is a background, and its `on` partner is the
// text or icon color that sits on top of it. Always use them as a pair.
//   <View style={{ backgroundColor: colors.brandPrimary }}>
//     <Text style={{ color: colors.onBrandPrimary }}>Continue</Text>
//   </View>
//
// Styling a screen or component: build the sheet with makeStyles so colors
// and layout live together and follow the active scheme:
//   const useStyles = makeStyles((colors) => ({
//     card: { backgroundColor: colors.surfaceSecondary, padding: 16 },
//     title: { color: colors.onSurfaceSecondary, fontSize: 16 },
//   }));
//   function Screen() {
//     const styles = useStyles();
//     return <View style={styles.card}><Text style={styles.title}>Hi</Text></View>;
//   }
// For color props that are not styles (icon color, placeholderTextColor,
// ActivityIndicator) read useTheme().colors inside the component.
// Never call StyleSheet.create with color values at module level; it cannot
// follow the scheme.
//
// To support dark mode later: add `dark` to `themes` with every key filled.
// Nothing else changes; the device setting takes over automatically.
// Feel free to add as many new colors as you need to support the design guidelines.

import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme, ViewStyle } from "react-native";

export type ColorScheme = "light" | "dark";

// Colours taken 1:1 from the website askelon.uk (index.html :root and components):
//   --green #0B6E4F, --orange #FF6A00, --navy #0A2A5C, --graphite #070F1A (page background),
//   --card #0F2C4D, --text #F4F8FB, --muted #BACADA, --line rgba(255,255,255,.13),
//   footer #040A12, input #12304F, chat bubble #143A66, text on orange #1A0D00,
//   live dot #2EE59D, deep green #054A34, light green on green #B5F2D7, notes #98AEC2,
//   "soon" badge #FFD3A6 / #6B2800. The app is dark like the site and like the app mock-up on the site.
const dark = {
  // ---------------------------------------------------------------------------
  // Surfaces: backgrounds, from the screen down to small fills.
  // Each `on` key is the text and icon color for that background.
  // ---------------------------------------------------------------------------
  surface: "#070F1A",
  onSurface: "#F4F8FB",
  surfaceSecondary: "#0F2C4D",
  onSurfaceSecondary: "#F4F8FB",
  surfaceTertiary: "#12304F",
  onSurfaceTertiary: "#BACADA",
  surfaceInverse: "#F4F8FB",
  onSurfaceInverse: "#070F1A",
  muted: "#BACADA",

  // ---------------------------------------------------------------------------
  // Brand
  // ---------------------------------------------------------------------------
  brand: "#0A2A5C",
  onBrand: "#FFFFFF",
  brandPrimary: "#0B6E4F",
  onBrandPrimary: "#FFFFFF",
  brandPrimaryText: "#2EE59D", // green used as text/icon on dark backgrounds
  brandPrimaryBorder: "rgba(46,229,157,0.45)",
  brandSecondary: "#0B6E4F", // top bar (as the app mock-up header on the site)
  onBrandSecondary: "#FFFFFF",
  brandSecondaryText: "#F4F8FB", // headings that used the bar colour as text
  brandTertiary: "#FF6A00",
  onBrandTertiary: "#1A0D00",
  brandPrimarySoft: "rgba(11,110,79,0.45)",
  brandPrimaryDeep: "#054A34",
  brandTertiarySoft: "rgba(255,106,0,0.14)",
  heritageGreen: "#0B6E4F",
  heritageGreenDeep: "#054A34",
  heritageOrange: "#FF6A00",
  heritageOrangeSoft: "rgba(255,106,0,0.14)",
  heritageCream: "#070F1A",
  onAccent: "#1A0D00", // text and icons on orange (as on the site buttons)
  tabBarBg: "#040A12", // bottom bar = site footer
  tabCases: "#FF6A00",
  tabLetters: "#FF6A00",
  tabForum: "#FF6A00",
  tabProfile: "#FF6A00",
  tabInactive: "#98AEC2",
  tabActiveBg: "rgba(255,106,0,0.16)",
  gold: "#FF6A00",
  onGold: "#1A0D00",
  goldSoft: "rgba(255,106,0,0.12)",

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------
  success: "#2EE59D",
  onSuccess: "#062A1C",
  successSoft: "rgba(46,229,157,0.14)",
  warning: "#FFD3A6",
  onWarning: "#6B2800",
  warningSoft: "rgba(255,106,0,0.14)",
  error: "#F26D6D",
  onError: "#1A0505",
  info: "#0A2A5C",
  onInfo: "#FFFFFF",

  border: "rgba(255,255,255,0.13)",
  borderStrong: "rgba(255,255,255,0.22)",
  divider: "rgba(255,255,255,0.08)",

  // "Ask Elon" palette — login / register and messages screens
  askGreen: "#0B6E4F",
  askGreenLight: "#054A34",
  askOrange: "#FF6A00",
  askOrangeTint: "rgba(255,106,0,0.16)",
  askNavy: "#F4F8FB",
  askInk: "#F4F8FB",
  askBgTop: "#0B6E4F", // site hero: linear-gradient(160deg, green 0%, navy 55%, graphite 100%)
  askBgMid: "#0A2A5C",
  askBgBottom: "#070F1A",
  askBorder: "rgba(255,255,255,0.13)",
  askField: "#12304F",
  askBubble: "#143A66",

  // Extra tokens
  onlineDot: "#2EE59D",
  footnote: "#98AEC2",
  onBrandSecondaryMuted: "#B5F2D7",
  glassFill: "rgba(255,255,255,0.12)",
  glassBorder: "rgba(255,255,255,0.22)",
  glassDivider: "rgba(255,255,255,0.16)",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

export const themes: { light?: ThemeColors; dark: ThemeColors } = { dark };

// In-app theme toggle, only after `dark` exists in `themes`. Call
// setColorScheme("dark"), setColorScheme("light"), or setColorScheme(null) to
// follow the device. Every useTheme() consumer re-renders. Persisting the
// choice and re-applying it on launch is the toggle's job.
export function setColorScheme(scheme: ColorScheme | null) {
  // RN 0.86 re-reads the device scheme only for the literal "unspecified";
  // null would pin useColorScheme() to null and the app to light.
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

// Keep native surfaces (alerts, pickers, navigation chrome) on the schemes this
// app ships: light only forces light; once `dark` exists the device decides.
// Optional call because react-native-web does not implement it.
setColorScheme?.(themes.light ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.dark };
}

// Themed StyleSheet: returns a hook that builds the sheet from the active
// scheme's colors and memoizes it until the scheme changes.
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}



// ---------------------------------------------------------------------------
// Orange effects (shadows, glows, rings). Use only through fx(name) so native
// (iOS/Android shadow props) and web (boxShadow) stay in sync.
// ---------------------------------------------------------------------------
type Effect = { native: ViewStyle; web: string; webExtra?: Record<string, unknown> };

export const effects = {
  shadowOrangeSoft: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 18, elevation: 8 },
    web: "0 6px 18px rgba(255,106,0,0.25), 0 2px 6px rgba(0,0,0,0.20)",
  },
  glowOrange: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6, borderWidth: 1.5, borderColor: "#FF6A00" },
    web: "0 0 0 3px rgba(255,106,0,0.35)",
  },
  cardShadow: {
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    web: "0 2px 8px rgba(0,0,0,0.06), 0 4px 14px rgba(255,106,0,0.07)",
  },
  cardPressed: {
    native: { borderWidth: 1.5, borderColor: "#FF6A00", shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
    web: "0 0 0 3px rgba(255,106,0,0.30), 0 6px 18px rgba(255,106,0,0.18)",
  },
  focusRing: {
    native: { borderWidth: 2, borderColor: "#FF6A00", elevation: 0 },
    web: "0 0 0 3px rgba(255,106,0,0.28)",
    webExtra: { outlineStyle: "none", borderColor: "#FF6A00" },
  },
  profileCardGlow: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 22, elevation: 10, borderWidth: 1, borderColor: "rgba(255,106,0,0.35)" },
    web: "0 10px 24px rgba(0,0,0,0.22), 0 6px 22px rgba(255,106,0,0.22), inset 0 0 0 1px rgba(255,106,0,0.35)",
  },
  badgeGlow: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 6, elevation: 4 },
    web: "0 0 0 2px var(--fx-under, #0B6E4F), 0 0 10px 2px rgba(255,106,0,0.55)",
  },
  chipProGlow: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 4 },
    web: "0 0 0 3px rgba(255,106,0,0.22), 0 0 12px 2px rgba(255,106,0,0.45)",
  },
  segmentActive: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 3 },
    web: "0 4px 12px rgba(255,106,0,0.18)",
  },
  languageActive: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 3, elevation: 1 },
    web: "0 0 0 3px rgba(255,106,0,0.18)",
  },
  tabDot: {
    native: { shadowColor: "#FF6A00", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 4, elevation: 2 },
    web: "0 0 0 3px rgba(255,106,0,0.18), 0 0 8px 1px rgba(255,106,0,0.55)",
  },
  // Neutral (non-orange) helpers so no component hard-codes shadows.
  buttonShadow: {
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 6, elevation: 4 },
    web: "0 3px 8px rgba(0,0,0,0.16)",
  },
  barShadow: {
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 12 },
    web: "0 -4px 12px rgba(0,0,0,0.06)",
  },
  toastShadow: {
    native: { shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
    web: "0 4px 12px rgba(0,0,0,0.15)",
  },
} satisfies Record<string, Effect>;

export type EffectName = keyof typeof effects;

/** Platform style for an orange effect. `under` = background colour under a badge (web ring colour). */
export function fx(name: EffectName, under?: string): ViewStyle {
  const e: Effect = effects[name];
  let web = e.web;
  if (web.includes("var(--fx-under")) web = web.replace(/var\(--fx-under, ([^)]+)\)/, under ?? "$1");
  return (Platform.select({
    web: { boxShadow: web, ...(e.webExtra ?? {}) },
    default: e.native,
  }) ?? e.native) as ViewStyle;
}
