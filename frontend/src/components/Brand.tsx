// Shared Ask Elon UI pieces: floating action button, accent card, filter chip, focus-ring input.
// All shadows/glows come from fx() in theme.ts.
import Ionicons from "@react-native-vector-icons/ionicons";
import { forwardRef, ReactNode, useState } from "react";
import { Pressable, PressableProps, StyleProp, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usesNativeTabs } from "@/src/navigation";
import { fx, makeStyles, useTheme } from "@/src/theme";

export const FAB_HEIGHT = 52;
/** Gap between the FAB and the top of the tab bar; clears the raised middle "Elon" button. */
export const FAB_GAP = 32;

/** Bottom offset for a FAB inside a tab screen (screen content already ends above the JS tab bar). */
export function useFabBottom() {
  const insets = useSafeAreaInsets();
  return (usesNativeTabs ? insets.bottom : 0) + FAB_GAP;
}
/** paddingBottom for lists under a FAB: FAB height + 40 px (+ its offset). */
export function useFabListPadding() {
  return useFabBottom() + FAB_HEIGHT + 40;
}

export function Fab({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bottom = useFabBottom();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { bottom }, pressed ? [fx("glowOrange"), styles.fabPressed] : fx("shadowOrangeSoft")]}
    >
      <View pointerEvents="none" style={styles.fabInner} />
      <Ionicons name={icon} size={20} color={colors.askOrange} />
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

/** White card with orange 3 px accent bar, warm shadow and orange ring while pressed. */
export function AccentCard({ children, style, accent = true, ...rest }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable {...rest} style={({ pressed }) => [styles.card, style, pressed ? [fx("cardPressed"), styles.cardPressed] : fx("cardShadow")]}>
      {accent && <View pointerEvents="none" style={styles.accent} />}
      {children}
    </Pressable>
  );
}

/** Filter chip used in Forum and Letters (active: green + orange underline inside the chip). */
export function Chip({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
      {active && <View pointerEvents="none" style={styles.chipUnderline} />}
    </Pressable>
  );
}

export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    ring: focused ? fx("focusRing") : null,
    handlers: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
  };
}

/** TextInput that shows the orange focus ring while focused and #D6DFDA border otherwise. */
export const FocusTextInput = forwardRef<TextInput, TextInputProps>(function FocusTextInput({ style, onFocus, onBlur, ...rest }, ref) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.muted}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.inputBorder, style, focused && fx("focusRing"), focused && styles.inputFocused]}
    />
  );
});

const useStyles = makeStyles((c) => ({
  fab: {
    position: "absolute",
    right: 16,
    height: FAB_HEIGHT,
    paddingHorizontal: 22,
    borderRadius: 26,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fabPressed: { transform: [{ scale: 0.97 }] },
  fabInner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 26, borderWidth: 1.5, borderColor: "rgba(255,122,24,0.55)" },
  fabText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, fontSize: 14 },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  cardPressed: { borderColor: c.askOrange },
  accent: { position: "absolute", left: 0, top: 14, bottom: 14, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.askOrange },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong, flexShrink: 0, overflow: "hidden" },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { color: c.brandSecondary, fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: c.onBrandPrimary, fontWeight: "700" },
  chipUnderline: { position: "absolute", left: 14, right: 14, bottom: 4, height: 3, borderRadius: 2, backgroundColor: c.askOrange },
  inputBorder: { borderWidth: 1, borderColor: c.borderStrong },
  inputFocused: { borderColor: c.askOrange },
}));
