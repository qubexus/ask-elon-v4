// Design tokens for this app. Light theme only.Always modify the colors and theme to Dark, Light or Dark and Light according to the design guidelines.
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

const light = {
  // ---------------------------------------------------------------------------
  // Surfaces: backgrounds, from the screen down to small fills.
  // Each `on` key is the text and icon color for that background.
  // ---------------------------------------------------------------------------
  surface: "#F4F7F5",
  onSurface: "#0F1A24",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#0F1A24",
  surfaceTertiary: "#EEF3F0",
  onSurfaceTertiary: "#3F4D49",
  surfaceInverse: "#0F1A24",
  onSurfaceInverse: "#FFFFFF",
  muted: "#5B6B66",

  // ---------------------------------------------------------------------------
  // Brand: the identity color and the fills built from it.
  // Neutral by default; replace with the design guidelines values.
  // ---------------------------------------------------------------------------
  brand: "#132B41",
  onBrand: "#FFFFFF",
  brandPrimary: "#1D4F3C",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#132B41",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FF7A18",
  onBrandTertiary: "#0F1A24",
  brandPrimarySoft: "#E8F1EC",
  brandPrimaryDeep: "#163E2F",
  brandTertiarySoft: "#FFF1E6",
  heritageGreen: "#1D4F3C",
  heritageGreenDeep: "#163E2F",
  heritageOrange: "#FF7A18",
  heritageOrangeSoft: "#FFF1E6",
  heritageCream: "#FBF8F3",
  tabCases: "#1D4F3C",
  tabLetters: "#1D4F3C",
  tabForum: "#1D4F3C",
  tabProfile: "#1D4F3C",
  tabInactive: "#5B6B66",
  tabActiveBg: "#E3EEE8",
  gold: "#FF7A18",
  onGold: "#0F1A24",
  goldSoft: "#FFF1E6",

  // ---------------------------------------------------------------------------
  // Status: semantic only, never decorative. Fill for badges, banners and
  // toasts; the `on` key is text on that fill. The plain key is also safe as
  // text on `surface`.
  // ---------------------------------------------------------------------------
  success: "#1D4F3C",
  onSuccess: "#FFFFFF",
  successSoft: "#E3EEE8",
  warning: "#B8530A",
  onWarning: "#FFFFFF",
  warningSoft: "#FFF1E6",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#132B41",
  onInfo: "#FFFFFF",

  border: "#E3E9E6",
  borderStrong: "#D6DFDA",
  divider: "#EEF2F0",

  // "Ask Elon" brand palette — login / register screen only
  askGreen: "#1D4F3C",
  askGreenLight: "#24634B",
  askOrange: "#FF7A18",
  askOrangeTint: "rgba(255,122,24,0.09)",
  askNavy: "#132B41",
  askInk: "#0F1A24",
  askBgTop: "#EAF2EE",
  askBgMid: "#F6F8F7",
  askBgBottom: "#FFF7F0",
  askBorder: "#DCE3E0",
  askField: "#FFFFFF",

  // Extra tokens for the brand UI refresh
  onlineDot: "#58D68D",
  footnote: "#7A8884",
  onBrandSecondaryMuted: "rgba(255,255,255,0.72)",
  glassFill: "rgba(255,255,255,0.12)",
  glassBorder: "rgba(255,255,255,0.22)",
  glassDivider: "rgba(255,255,255,0.16)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

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
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
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
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 18, elevation: 8 },
    web: "0 6px 18px rgba(255,122,24,0.25), 0 2px 6px rgba(19,43,65,0.20)",
  },
  glowOrange: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6, borderWidth: 1.5, borderColor: "#FF7A18" },
    web: "0 0 0 3px rgba(255,122,24,0.35)",
  },
  cardShadow: {
    native: { shadowColor: "#132B41", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
    web: "0 2px 8px rgba(19,43,65,0.06), 0 4px 14px rgba(255,122,24,0.07)",
  },
  cardPressed: {
    native: { borderWidth: 1.5, borderColor: "#FF7A18", shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
    web: "0 0 0 3px rgba(255,122,24,0.30), 0 6px 18px rgba(255,122,24,0.18)",
  },
  focusRing: {
    native: { borderWidth: 2, borderColor: "#FF7A18", elevation: 0 },
    web: "0 0 0 3px rgba(255,122,24,0.28)",
    webExtra: { outlineStyle: "none", borderColor: "#FF7A18" },
  },
  profileCardGlow: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 22, elevation: 10, borderWidth: 1, borderColor: "rgba(255,122,24,0.35)" },
    web: "0 10px 24px rgba(19,43,65,0.22), 0 6px 22px rgba(255,122,24,0.22), inset 0 0 0 1px rgba(255,122,24,0.35)",
  },
  badgeGlow: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 6, elevation: 4 },
    web: "0 0 0 2px var(--fx-under, #132B41), 0 0 10px 2px rgba(255,122,24,0.55)",
  },
  chipProGlow: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.45, shadowRadius: 10, elevation: 4 },
    web: "0 0 0 3px rgba(255,122,24,0.22), 0 0 12px 2px rgba(255,122,24,0.45)",
  },
  segmentActive: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 3 },
    web: "0 4px 12px rgba(255,122,24,0.18)",
  },
  languageActive: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 3, elevation: 1 },
    web: "0 0 0 3px rgba(255,122,24,0.18)",
  },
  tabDot: {
    native: { shadowColor: "#FF7A18", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 4, elevation: 2 },
    web: "0 0 0 3px rgba(255,122,24,0.18), 0 0 8px 1px rgba(255,122,24,0.55)",
  },
  // Neutral (non-orange) helpers so no component hard-codes shadows.
  buttonShadow: {
    native: { shadowColor: "#132B41", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 6, elevation: 4 },
    web: "0 3px 8px rgba(19,43,65,0.16)",
  },
  barShadow: {
    native: { shadowColor: "#132B41", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 12 },
    web: "0 -4px 12px rgba(19,43,65,0.06)",
  },
  toastShadow: {
    native: { shadowColor: "#132B41", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
    web: "0 4px 12px rgba(19,43,65,0.15)",
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
