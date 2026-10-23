import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Image } from "expo-image";

import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { useUnreadCount } from "@/src/inbox";
import { makeStyles, useTheme } from "@/src/theme";

export function Header({ title, subtitle, back, right, robot }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode; robot?: boolean }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const t = useT();
  const unread = useUnreadCount();
  const badge = unread > 9 ? "9+" : String(unread);
  const initials = (user?.name || user?.email || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      {back && (
        <Pressable testID="header-back-button" onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.onBrandSecondary} />
        </Pressable>
      )}
      {!back && (
        <View style={styles.logo} testID="header-logo">
          {robot ? (
            <Image source={require("@/assets/brand/robot-header.png")} style={styles.robot} contentFit="contain" accessibilityLabel="Ask Elon" />
          ) : (
            <Image source={require("@/assets/brand/icon-e.webp")} style={styles.logoImg} contentFit="cover" accessibilityLabel="Ask Elon" />
          )}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1} testID="header-title">{title}</Text>
        {!!subtitle && <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
      {user && (
        <Pressable
          testID="header-messages-button"
          onPress={() => router.push("/messages")}
          hitSlop={6}
          style={styles.msgBtn}
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `${t("msgTitle")}, ${t("msgUnreadA11y", { n: String(unread) })}` : t("msgTitle")}
        >
          <Ionicons name="mail-outline" size={24} color={colors.onBrandSecondary} />
          {unread > 0 && (
            <View style={styles.badge} testID="header-messages-badge">
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </Pressable>
      )}
      {user && (
        <Pressable testID="header-user" onPress={() => router.push("/profile?tab=data")} style={styles.user} hitSlop={4}>
          {user.picture ? <Image source={{ uri: user.picture }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>}
        </Pressable>
      )}
      {user && (
        <Pressable testID="header-logout-button" onPress={signOut} hitSlop={8} style={styles.logout} accessibilityLabel="Logout">
          <Ionicons name="log-out-outline" size={22} color={colors.onBrandSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    backgroundColor: c.brandSecondary,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  back: { width: 36, height: 44, justifyContent: "center", marginLeft: -8 },
  logo: { width: 34, height: 34, borderRadius: 9, overflow: "hidden" },
  logoImg: { width: "100%", height: "100%" },
  robot: { width: 44, height: 44, marginRight: 2 },
  msgBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 4, right: -2, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.askOrange, borderWidth: 2, borderColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "900" },
  user: { marginLeft: 4 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.onBrandSecondary },
  avatarText: { color: c.onBrandPrimary, fontWeight: "900", fontSize: 12 },
  logout: { width: 40, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 },
  title: { color: c.onBrandSecondary, fontSize: 20, fontWeight: "900" },
  sub: { color: c.onBrandSecondary, opacity: 0.7, fontSize: 12, marginTop: 2 },
}));
