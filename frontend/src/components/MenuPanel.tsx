// Main menu: ☰ button at the top-right of the header + right-side drawer (shared RightDrawer, same look and
// animation as the notes panel). Reuses the existing navigation: the five tabs (same labels and icons as the
// bottom bar), notes, messages, documents, audit history, subscription screen, admin hub (admins only),
// language switch, help/contact and sign-out with a confirmation step.
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { Href, router, usePathname } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import { accountIdOf, formatAccountId } from "@/src/accountId";
import { useAuth } from "@/src/auth";
import { LanguageSwitch } from "@/src/components/LanguageSwitch";
import { NotesDrawer } from "@/src/components/NotesPanel";
import { RightDrawer } from "@/src/components/RightDrawer";
import { SITE_URL, SUPPORT_EMAIL } from "@/src/components/SiteFooter";
import { useT } from "@/src/i18n";
import { MENU_TABS, unreadBadge } from "@/src/menu";
import { useUnreadCount } from "@/src/inbox";
import { usePro } from "@/src/revenuecat";
import { makeStyles, useTheme } from "@/src/theme";

/** Header ☰ button that opens the main menu drawer. Mounted once in Header (last icon on the right). */
export function MenuButton() {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);
  const onNotesClose = useCallback(() => setNotes(false), []);
  return (
    <>
      <Pressable testID="header-menu-button" onPress={() => setOpen(true)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t("menuOpen")}
        aria-haspopup="dialog" aria-expanded={open}>
        <Ionicons name="menu" size={26} color={colors.onBrandSecondary} />
      </Pressable>
      {open && <MenuDrawer onClose={onClose} onOpenNotes={() => setNotes(true)} />}
      {notes && <NotesDrawer onClose={onNotesClose} />}
    </>
  );
}

function MenuDrawer({ onClose, onOpenNotes }: { onClose: () => void; onOpenNotes: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const { user, signOut } = useAuth();
  const isPro = usePro();
  const unread = useUnreadCount();
  const pathname = usePathname() || "/";
  const [confirmLogout, setConfirmLogout] = useState(false);
  const isAdmin = user?.role === "admin";
  const accountId = formatAccountId(accountIdOf(user));
  const initials = (user?.name || user?.email || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  // Actions run after the closing animation, so the drawer never covers the next screen / drawer.
  const after = useRef<null | (() => void)>(null);
  const handleClose = useCallback(() => {
    const fn = after.current;
    after.current = null;
    onClose();
    fn?.();
  }, [onClose]);

  return (
    <RightDrawer
      onClose={handleClose}
      idBase="menu"
      title={t("menuTitle")}
      closeLabel={t("menuClose")}
      onBack={() => (confirmLogout ? (setConfirmLogout(false), true) : false)}
      leading={<Ionicons name="menu" size={22} color={colors.askOrange} style={{ marginLeft: 4 }} />}
    >
      {(close) => {
        const go = (fn: () => void) => {
          after.current = fn;
          close();
        };
        const nav = (href: Href) => go(() => router.navigate(href));
        const row = (o: { key: string; icon: string; label: string; onPress: () => void; active?: boolean; badge?: string; external?: boolean; sub?: string }) => (
          <Pressable
            key={o.key}
            testID={`menu-item-${o.key}`}
            onPress={o.onPress}
            style={({ pressed }) => [styles.item, o.active && styles.itemActive, pressed && styles.itemPressed]}
            accessibilityRole={o.external ? "link" : "button"}
            accessibilityState={o.active ? { selected: true } : undefined}
            accessibilityLabel={o.active ? `${o.label}, ${t("menuCurrent")}` : o.badge ? `${o.label}, ${o.badge}` : o.label}
            aria-current={o.active ? "page" : undefined}
          >
            {o.active && <View style={styles.activeBar} />}
            <Ionicons name={o.icon as any} size={21} color={o.active ? colors.askOrange : colors.tabInactive} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.itemText, o.active && styles.itemTextActive]} numberOfLines={1}>{o.label}</Text>
              {!!o.sub && <Text style={styles.itemSub} numberOfLines={1}>{o.sub}</Text>}
            </View>
            {!!o.badge && <View style={styles.badge}><Text style={styles.badgeText}>{o.badge}</Text></View>}
            <Ionicons name={o.external ? "open-outline" : "chevron-forward"} size={16} color={colors.footnote} />
          </Pressable>
        );
        const section = (label: string) => <Text style={styles.section} accessibilityRole="header">{label}</Text>;

        return (
          <ScrollView contentContainerStyle={styles.scroll} testID="menu-list" showsVerticalScrollIndicator={false}>
            {user && (
              <Pressable testID="menu-user" onPress={() => nav("/profile?tab=data")} style={({ pressed }) => [styles.userCard, pressed && styles.itemPressed]}
                accessibilityRole="button" accessibilityLabel={`${t("tabProfile")}: ${user.name || user.email}`}>
                {user.picture ? <Image source={{ uri: user.picture }} style={styles.avatar} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.userName} numberOfLines={1}>{user.name || user.email}</Text>
                  {!!accountId && <Text style={styles.userId} numberOfLines={1} testID="menu-account-id">{t("menuAccountId")}: {accountId}</Text>}
                  <View style={styles.badgeRow}>
                    <View style={[styles.plan, isPro ? styles.planPro : styles.planFree]} testID={isPro ? "menu-plan-pro" : "menu-plan-free"}>
                      <Text style={[styles.planText, isPro && styles.planTextPro]}>{isPro ? t("menuPro") : t("menuFree")}</Text>
                    </View>
                    {isAdmin && <View style={[styles.plan, styles.planAdmin]}><Text style={styles.planText}>ADMIN</Text></View>}
                  </View>
                </View>
              </Pressable>
            )}

            {section(t("menuSecNav"))}
            {MENU_TABS.map((it) => {
              const active = it.match(pathname);
              return row({ key: it.key, icon: active ? it.iconOn : it.icon, label: t(it.label), active, onPress: () => nav(it.href as Href) });
            })}

            {section(t("menuSecTools"))}
            {row({ key: "notes", icon: "document-text-outline", label: t("notesTitle"), onPress: () => go(onOpenNotes) })}
            {row({ key: "messages", icon: "mail-outline", label: t("msgTitle"), active: pathname.startsWith("/messages"), badge: unreadBadge(unread), onPress: () => nav("/messages") })}
            {row({ key: "documents", icon: "folder-open-outline", label: t("tabDocs"), onPress: () => nav("/profile?tab=docs") })}
            {row({ key: "audits", icon: "stats-chart-outline", label: t("auditHistory"), active: pathname.startsWith("/audits"), onPress: () => nav("/audits") })}

            {section(t("menuSecAccount"))}
            {row({ key: "membership", icon: isPro ? "ribbon" : "ribbon-outline", label: t("membership"), sub: isPro ? t("menuPro") : t("menuUpgrade"), active: pathname.startsWith("/paywall"), onPress: () => nav("/paywall") })}

            {isAdmin && section(t("menuSecAdmin"))}
            {isAdmin && row({ key: "admin", icon: "shield-half", label: t("menuAdminHub"), active: pathname === "/admin", onPress: () => nav("/admin") })}
            {isAdmin && row({ key: "admin-messages", icon: "mail-unread-outline", label: t("menuAdminMessages"), active: pathname.startsWith("/admin-messages"), onPress: () => nav("/admin-messages") })}

            {section(t("menuSecLang"))}
            <LanguageSwitch />

            {section(t("menuSecHelp"))}
            {row({ key: "contact", icon: "chatbox-ellipses-outline", label: t("menuContact"), sub: SUPPORT_EMAIL, external: true, onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}) })}
            {row({ key: "site", icon: "globe-outline", label: t("menuSite"), external: true, onPress: () => Linking.openURL(SITE_URL).catch(() => {}) })}

            {user && (confirmLogout ? (
              <View style={styles.confirm} testID="menu-logout-confirm">
                <Text style={styles.confirmText}>{t("menuLogoutConfirm")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => setConfirmLogout(false)} style={[styles.secondaryBtn, { flex: 1 }]} accessibilityRole="button" testID="menu-logout-cancel">
                    <Text style={styles.secondaryText}>{t("cancel")}</Text>
                  </Pressable>
                  <Pressable onPress={() => go(() => { signOut(); })} style={[styles.dangerBtn, { flex: 1 }]} accessibilityRole="button" testID="menu-logout-yes">
                    <Text style={styles.dangerText}>{t("menuLogoutYes")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setConfirmLogout(true)} style={({ pressed }) => [styles.logout, pressed && styles.itemPressed]} accessibilityRole="button" testID="menu-item-logout">
                <Ionicons name="log-out-outline" size={20} color={colors.error} />
                <Text style={styles.logoutText}>{t("logout")}</Text>
              </Pressable>
            ))}
          </ScrollView>
        );
      }}
    </RightDrawer>
  );
}

const useStyles = makeStyles((c) => ({
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 28, gap: 2 },
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, marginBottom: 4 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.askOrange },
  avatarText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  userName: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  userId: { color: c.onSurfaceTertiary, fontSize: 12.5, marginTop: 1, fontVariant: ["tabular-nums"] },
  badgeRow: { flexDirection: "row", gap: 6, marginTop: 5 },
  plan: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  planPro: { backgroundColor: c.askOrange, borderColor: c.askOrange },
  planFree: { backgroundColor: "transparent", borderColor: c.borderStrong },
  planAdmin: { backgroundColor: c.brandPrimarySoft, borderColor: c.brandPrimaryBorder },
  planText: { color: c.onSurface, fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  planTextPro: { color: c.onAccent },
  section: { color: c.footnote, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 14, marginBottom: 4, marginLeft: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden" },
  itemActive: { backgroundColor: c.tabActiveBg },
  itemPressed: { opacity: 0.75 },
  activeBar: { position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2, backgroundColor: c.askOrange },
  itemText: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  itemTextActive: { color: c.askOrange, fontWeight: "800" },
  itemSub: { color: c.footnote, fontSize: 12 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center" },
  badgeText: { color: c.onAccent, fontSize: 11.5, fontWeight: "900" },
  logout: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, paddingHorizontal: 12, borderRadius: 12, marginTop: 16, borderWidth: 1, borderColor: c.errorSoft },
  logoutText: { color: c.error, fontSize: 15, fontWeight: "700" },
  confirm: { backgroundColor: c.errorSoft, borderRadius: 12, padding: 12, gap: 10, marginTop: 16 },
  confirmText: { color: c.onSurface, fontWeight: "600", textAlign: "center" },
  secondaryBtn: { borderRadius: 12, minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.borderStrong },
  secondaryText: { color: c.onSurface, fontWeight: "700" },
  dangerBtn: { backgroundColor: c.error, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  dangerText: { color: c.onError, fontWeight: "800" },
}));
