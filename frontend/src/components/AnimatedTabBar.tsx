import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "@/src/i18n";
import { makeStyles, ThemeColors, useTheme } from "@/src/theme";

type Cfg = { on: string; off: string; color: keyof ThemeColors; label: any };
const CFG: Record<string, Cfg> = {
  cases: { on: "folder", off: "folder-outline", color: "tabCases", label: "tabCases" },
  templates: { on: "document-text", off: "document-text-outline", color: "tabLetters", label: "tabTemplates" },
  forum: { on: "people", off: "people-outline", color: "tabForum", label: "tabForum" },
  profile: { on: "person-circle", off: "person-circle-outline", color: "tabProfile", label: "tabProfile" },
};

function TabItem({ name, focused, onPress }: { name: string; focused: boolean; onPress: () => void }) {
  const t = useT();
  const styles = useStyles();
  const { colors } = useTheme();
  const cfg = CFG[name];
  const tint = colors[cfg.color] as string;
  const scale = useSharedValue(focused ? 1 : 0.9);
  const lift = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(focused ? 1.12 : 0.92, { damping: 9, stiffness: 180 });
    lift.value = focused ? withSequence(withTiming(-5, { duration: 140 }), withSpring(0, { damping: 6 })) : withTiming(0);
  }, [focused, scale, lift]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateY: lift.value }] }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: withTiming(focused ? 1 : 0, { duration: 200 }), transform: [{ scaleX: withSpring(focused ? 1 : 0.4) }] }));
  return (
    <Pressable testID={`tab-${name}`} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.pill, { backgroundColor: tint + "22" }, pillStyle]} />
        <Animated.View style={iconStyle}>
          <Ionicons name={(focused ? cfg.on : cfg.off) as any} size={23} color={focused ? tint : tint + "AA"} />
        </Animated.View>
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: focused ? tint : colors.muted }, focused && styles.labelOn]}>{t(cfg.label)}</Text>
    </Pressable>
  );
}

const GLOW = "0px 6px 16px rgba(19,43,65,0.28), 0px 0px 0px 6px rgba(255,122,24,0.10), 0px 0px 22px 4px rgba(255,122,24,0.28)";
const GLOW_ON = "0px 6px 16px rgba(19,43,65,0.28), 0px 0px 0px 7px rgba(255,122,24,0.20), 0px 0px 28px 8px rgba(255,122,24,0.45)";

function ChatButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const t = useT();
  const styles = useStyles();
  const [pressed, setPressed] = useState(false);
  const press = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
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
        <Image source={require("@/assets/brand/czat-przycisk.png")} style={styles.chatImg} contentFit="contain" accessible={false} alt="" draggable={false} />
        <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
      </Animated.View>
      <Text style={[styles.label, styles.chatLabel]}>Elon</Text>
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
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 6,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  item: { flex: 1, alignItems: "center", gap: 2, minHeight: 50, justifyContent: "flex-end" },
  iconWrap: { width: 52, height: 32, alignItems: "center", justifyContent: "center" },
  pill: { position: "absolute", width: 52, height: 32, borderRadius: 16 },
  label: { fontSize: 11, fontWeight: "600" },
  labelOn: { fontWeight: "800" },
  chatItem: { flex: 1.2, alignItems: "center", minHeight: 50, justifyContent: "flex-end", overflow: "visible" },
  chatFloat: { width: 64, height: 64, borderRadius: 32, marginTop: -30, overflow: "visible" },
  chatImg: { width: 64, height: 64, borderRadius: 32 },
  aiBadge: { position: "absolute", top: -3, right: -8, backgroundColor: c.askOrange, borderRadius: 9, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: "#FFFFFF" },
  aiBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  chatLabel: { color: c.askGreen, fontWeight: "700", marginTop: 2 },
}));
