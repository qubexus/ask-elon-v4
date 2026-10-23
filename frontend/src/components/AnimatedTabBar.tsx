import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { useReduceMotion } from "@/src/motion";
import { fx, makeStyles, useTheme } from "@/src/theme";

type Cfg = { on: string; off: string; label: any };
const CFG: Record<string, Cfg> = {
  cases: { on: "folder", off: "folder-outline", label: "tabCases" },
  templates: { on: "document-text", off: "document-text-outline", label: "tabTemplates" },
  forum: { on: "people", off: "people-outline", label: "tabForum" },
  profile: { on: "person-circle", off: "person-circle-outline", label: "tabProfile" },
};

function TabItem({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const cfg = CFG[name];
  const reduceMotion = useReduceMotion();
  // State transition only (≤200 ms); no bounce, nothing under reduced motion.
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = reduceMotion ? (focused ? 1 : 0) : withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, on, reduceMotion]);
  const pillStyle = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scaleX: 0.6 + 0.4 * on.value }] }));
  return (
    <Pressable testID={`tab-${name}`} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
      <View style={styles.iconWrap}>
        {focused && <View style={[styles.dot, fx("tabDot")]} testID={`tab-${name}-active-dot`} />}
        <Animated.View style={[styles.pill, pillStyle]} />
        <Ionicons name={(focused ? cfg.on : cfg.off) as any} size={23} color={focused ? colors.tabCases : colors.tabInactive} />
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: focused ? colors.tabCases : colors.tabInactive }, focused && styles.labelOn]}>{t(cfg.label)}</Text>
    </Pressable>
  );
}

const GLOW = "0px 6px 16px rgba(0,0,0,0.45), 0px 0px 0px 6px rgba(255,106,0,0.10), 0px 0px 22px 4px rgba(255,106,0,0.28)";
// Extra halo layer for the one-off breath: adds ~0.17 to the 0.28 glow opacity (→ ≈0.45).
const BREATH = "0px 0px 22px 4px rgba(255,106,0,0.17)";
const GLOW_ON = "0px 6px 16px rgba(0,0,0,0.45), 0px 0px 0px 7px rgba(255,106,0,0.20), 0px 0px 28px 8px rgba(255,106,0,0.45)";

function ChatButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const t = useT();
  const styles = useStyles();
  const [pressed, setPressed] = useState(false);
  const press = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  // One gentle "breath" of the glow once after entering the app; skipped with reduced motion.
  const reduceMotion = useReduceMotion();
  const breath = useSharedValue(0);
  const breathed = useRef(false);
  useEffect(() => {
    if (reduceMotion !== false || breathed.current) return;
    breathed.current = true;
    breath.value = withSequence(withTiming(1, { duration: 800 }), withTiming(0, { duration: 800 }));
  }, [reduceMotion, breath]);
  const breathStyle = useAnimatedStyle(() => ({ opacity: breath.value }));
  return (
    <Pressable
      testID="tab-chat"
      onPress={onPress}
      onPressIn={() => {
        setPressed(true);
        press.set(withTiming(0.95, { duration: 120 }));
      }}
      onPressOut={() => {
        setPressed(false);
        press.set(withTiming(1, { duration: 120 }));
      }}
      style={styles.chatItem}
      accessibilityRole="tab"
      accessibilityLabel={t("chatTabA11y")}
      accessibilityState={{ selected: focused }}
      {...(Platform.OS === "web" ? ({ "aria-current": focused ? "page" : undefined } as any) : null)}
    >
      <Animated.View style={[styles.chatFloat, { boxShadow: focused || pressed ? GLOW_ON : GLOW }, btnStyle]}>
        <Animated.View pointerEvents="none" style={[styles.breath, { boxShadow: BREATH }, breathStyle]} />
        <Image source={require("@/assets/brand/czat-przycisk.png")} style={styles.chatImg} contentFit="contain" accessible={false} alt="" draggable={false} />
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
      </Animated.View>
      <Text style={[styles.label, styles.chatLabel, focused && styles.chatLabelOn]}>Elon</Text>
    </Pressable>
  );
}

type TabRoute = { key: string; name: string };
export function AnimatedTabBar({ state, navigation }: { state: { index: number; routes: TabRoute[] }; navigation: any }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} testID="tab-bar">
      {state.routes.map((route: TabRoute, i: number) => {
        const focused = state.index === i;
        const onPress = () => {
          const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) {
            if (Platform.OS !== "web") Haptics.selectionAsync();
            navigation.navigate(route.name);
          }
        };
        if (route.name === "index") return <ChatButton key={route.key} focused={focused} onPress={onPress} />;
        if (!CFG[route.name]) return null;
        return <TabItem key={route.key} name={route.name} focused={focused} onPress={onPress} />;
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: {
    overflow: "visible",
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: c.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
    ...fx("barShadow"),
  },
  item: { flex: 1, alignItems: "center", gap: 2, minHeight: 50, justifyContent: "flex-end" },
  iconWrap: { width: 52, height: 32, alignItems: "center", justifyContent: "center", overflow: "visible" },
  pill: { position: "absolute", width: 52, height: 32, borderRadius: 16, backgroundColor: c.tabActiveBg },
  dot: { position: "absolute", top: -6, alignSelf: "center", width: 6, height: 6, borderRadius: 3, backgroundColor: c.askOrange },
  label: { fontSize: 11, fontWeight: "600", lineHeight: 14, height: 14 },
  labelOn: { fontWeight: "700" },
  chatItem: { flex: 1.2, alignItems: "center", minHeight: 50, justifyContent: "flex-end", overflow: "visible" },
  chatFloat: { width: 64, height: 64, borderRadius: 32, marginTop: -30, overflow: "visible" },
  chatImg: { width: 64, height: 64, borderRadius: 32 },
  aiBadge: { position: "absolute", top: -3, right: -8, backgroundColor: c.askOrange, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: c.tabBarBg },
  aiBadgeText: { color: c.onAccent, fontSize: 10, fontWeight: "800" },
  chatLabel: { color: c.onSurface, fontWeight: "700", marginTop: 2 },
  chatLabelOn: { color: c.tabCases }, // active = same orange as the other tabs
  breath: { position: "absolute", top: 0, left: 0, width: 64, height: 64, borderRadius: 32 },
}));
