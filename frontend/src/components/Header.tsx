import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ReactNode, useEffect, useRef } from "react";
import { Platform, Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { useUnreadCount } from "@/src/inbox";
import { useReduceMotion } from "@/src/motion";
import { fx, makeStyles, useTheme } from "@/src/theme";

export type RobotName = "sprawy" | "pisma" | "elon" | "forum" | "profil";

// Same loading method as the old robot-header: bundled PNG through expo-image.
// Files are the 132 px (@3x) masters, displayed at 44 px.
export const ROBOTS: Record<RobotName, number> = {
  sprawy: require("@/assets/brand/robot-tab-sprawy.png"),
  pisma: require("@/assets/brand/robot-tab-pisma.png"),
  elon: require("@/assets/brand/robot-tab-elon.png"),
  forum: require("@/assets/brand/robot-tab-forum.png"),
  profil: require("@/assets/brand/robot-tab-profil.png"),
};

type Props = {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  robot?: RobotName;
  /** Green "online" dot before the subtitle (chat). */
  online?: boolean;
  onlineA11y?: string;
  /** Hide the avatar (Profile screen). */
  hideAvatar?: boolean;
};

export function Header({ title, subtitle, back, right, robot = "elon", online, onlineA11y, hideAvatar }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { user, signOut } = useAuth();
  const t = useT();
  const unread = useUnreadCount();
  const reduceMotion = useReduceMotion();
  const badge = unread > 9 ? "9+" : String(unread);
  const initials = (user?.name || user?.email || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  // One-off pulse of the unread badge when a new message arrives (never on first load, never with reduced motion).
  const pulse = useSharedValue(1);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (prev.current !== null && unread > prev.current && reduceMotion === false) {
      pulse.value = withSequence(withTiming(1.15, { duration: 300 }), withTiming(1, { duration: 300 }));
    }
    prev.current = unread;
  }, [unread, reduceMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const titleSize = Platform.OS === "web" ? (width < 375 ? 17 : 18) : 18;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]} testID="app-header">
      {back ? (
        <Pressable testID="header-back-button" onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.onBrandSecondary} />
        </Pressable>
      ) : (
        <Image
          testID={`header-robot-${robot}`}
          source={ROBOTS[robot]}
          style={styles.robot}
          contentFit="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel="Ask Elon"
          alt="Ask Elon"
        />
      )}
      <View style={styles.textBlock}>
        <Text
          style={[styles.title, back ? styles.titleBack : { fontSize: titleSize }]}
          numberOfLines={back ? 2 : 1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          ellipsizeMode="tail"
          testID="header-title"
        >
          {title}
        </Text>
        {!!subtitle && (
          <View style={styles.subRow} accessible={online ? true : undefined} accessibilityLabel={online ? onlineA11y : undefined}>
            {online && <Text style={styles.onlineDot}>●</Text>}
            <Text style={styles.sub} numberOfLines={1} ellipsizeMode="tail" testID="header-subtitle">{subtitle}</Text>
          </View>
        )}
      </View>
      <View style={styles.rightGroup}>
        {right}
        {user && (
          <Pressable
            testID="header-messages-button"
            onPress={() => router.push("/messages")}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `${t("msgTitle")}, ${t("msgUnreadA11y", { n: String(unread) })}` : t("msgTitle")}
          >
            <Ionicons name="mail-outline" size={24} color={colors.onBrandSecondary} />
            {unread > 0 && (
              <Animated.View style={[styles.badge, fx("badgeGlow", colors.brandSecondary), pulseStyle]} testID="header-messages-badge">
                <Text style={styles.badgeText}>{badge}</Text>
              </Animated.View>
            )}
          </Pressable>
        )}
        {user && !hideAvatar && (
          <Pressable testID="header-user" onPress={() => router.push("/profile?tab=data")} style={styles.user} accessibilityRole="button" accessibilityLabel={t("tabProfile")}>
            {user.picture ? <Image source={{ uri: user.picture }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>}
          </Pressable>
        )}
        {user && (
          <Pressable testID="header-logout-button" onPress={signOut} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("logout")}>
            <Ionicons name="log-out-outline" size={22} color={colors.onBrandSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Square 40×40 header icon button (used for extra right-side actions such as refresh). */
export function HeaderIconButton({ icon, onPress, label, testID }: { icon: any; onPress: () => void; label: string; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={colors.onBrandSecondary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    backgroundColor: c.brandSecondary,
    paddingLeft: 14,
    paddingRight: 12,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  back: { width: 36, height: 44, justifyContent: "center", marginLeft: -6 },
  robot: { width: 44, height: 44, flexShrink: 0 },
  textBlock: { flex: 1, minWidth: 0, justifyContent: "center", minHeight: 44 },
  title: { color: c.onBrandSecondary, fontWeight: "800", lineHeight: 22 },
  // Detail screens (user content titles): wrap to 2 lines instead of cutting.
  titleBack: { fontSize: 16, lineHeight: 20 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1, minWidth: 0 },
  onlineDot: { color: c.onlineDot, fontSize: 10, lineHeight: 16 },
  sub: { color: c.onBrandSecondaryMuted, fontSize: 12, fontWeight: "400", lineHeight: 16, flexShrink: 1 },
  rightGroup: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 1, right: 0, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.askOrange, borderWidth: 2, borderColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "900" },
  user: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.askOrange },
  avatarText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 12 },
}));
