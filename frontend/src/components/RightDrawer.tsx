// Shared right-side drawer (notes panel, main menu): slides in from the right (~240 ms, ease-out),
// dimmed backdrop, close on backdrop tap / close button / Escape (web) / Android back.
// Width: 85% of the screen on phones (<600 px), 380 px on wider screens. Reduced motion → no animation.
import Ionicons from "@react-native-vector-icons/ionicons";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReduceMotion } from "@/src/motion";
import { fx, makeStyles, useTheme } from "@/src/theme";

export const DRAWER_MS = 240;

export function drawerWidth(screenW: number) {
  return screenW < 600 ? Math.round(screenW * 0.85) : 380;
}

type Props = {
  /** Called after the closing animation has finished (unmount the drawer here). */
  onClose: () => void;
  title: string;
  /** Element left of the title (icon, or a back button). */
  leading?: ReactNode;
  closeLabel: string;
  /** testID prefix: `${idBase}-drawer`, `${idBase}-backdrop`, `${idBase}-close`. */
  idBase: string;
  /** Escape / Android back: return true when handled inside the drawer (e.g. leave an editor) instead of closing. */
  onBack?: () => boolean;
  /** Render prop gets `close()` which plays the closing animation and then calls onClose. */
  children: (close: () => void) => ReactNode;
};

export function RightDrawer({ onClose, title, leading, closeLabel, idBase, onBack, children }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const panelW = drawerWidth(width);
  const dur = reduceMotion ? 0 : DRAWER_MS;

  const x = useSharedValue(panelW);
  const fade = useSharedValue(0);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (closing) {
      if (!dur) return onClose();
      fade.value = withTiming(0, { duration: dur });
      x.value = withTiming(panelW, { duration: dur, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(onClose)();
      });
    } else {
      x.value = withTiming(0, { duration: dur, easing: Easing.out(Easing.cubic) });
      fade.value = withTiming(1, { duration: dur });
    }
  }, [closing, dur, panelW, onClose, x, fade]);
  const close = useCallback(() => setClosing(true), []);
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  // Web: move keyboard focus into the dialog (close button) when it opens.
  const closeRef = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const id = setTimeout(() => closeRef.current?.focus?.(), 50);
    return () => clearTimeout(id);
  }, []);

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => (onBack?.() ? undefined : close())} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel={closeLabel} testID={`${idBase}-backdrop`} />
        </Animated.View>
        <Animated.View
          style={[styles.panel, { width: panelW, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }, panelStyle]}
          testID={`${idBase}-drawer`}
          accessibilityViewIsModal
          aria-modal
          role="dialog"
          aria-label={title}
        >
          <View style={styles.head}>
            {leading}
            <Text style={styles.headTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
            <Pressable ref={closeRef} onPress={close} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={closeLabel} testID={`${idBase}-close`}>
              <Ionicons name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </View>
          {children(close)}
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  root: { flex: 1, flexDirection: "row", justifyContent: "flex-end" },
  backdrop: { ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: "rgba(4,10,18,0.62)" },
  panel: { height: "100%", backgroundColor: c.surface, borderLeftWidth: 1, borderLeftColor: c.headerBorder, paddingHorizontal: 14, ...fx("shadowOrangeSoft") },
  head: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  headTitle: { flex: 1, color: c.onSurface, fontSize: 18, fontWeight: "800" },
}));
