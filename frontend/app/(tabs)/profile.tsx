import Ionicons from "@react-native-vector-icons/ionicons";
import { withBrand } from "@/src/components/BrandName";
import { SiteFooter } from "@/src/components/SiteFooter";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { FALLBACK_PRICE, Plans, startPayPalSubscription } from "@/src/paypal";
import { usePro } from "@/src/revenuecat";
import { useAuth } from "@/src/auth";
import { AdminAndContact } from "@/src/components/AdminAndContact";
import { DocumentsPanel } from "@/src/components/DocumentsPanel";
import { LanguageSwitch } from "@/src/components/LanguageSwitch";
import { ProfileCard } from "@/src/components/ProfileCard";
import { ProfileForm } from "@/src/components/ProfileForm";
import { useToast } from "@/src/components/Toast";
import { Header } from "@/src/components/Header";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { useUnreadCount } from "@/src/inbox";
import { usesNativeTabs } from "@/src/navigation";
import { fx, makeStyles, useTheme } from "@/src/theme";


export default function Profile() {
  const { user, signOut, refreshUser, locale } = useAuth();
  const unread = useUnreadCount();
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const params = useLocalSearchParams<{ payment?: string; tab?: string }>();
  const [tab, setTab] = useState<"data" | "docs">(params.tab === "docs" ? "docs" : "data");
  useEffect(() => {
    if (params.tab === "docs" || params.tab === "data") setTab(params.tab);
  }, [params.tab]);
  const [plans, setPlans] = useState<Plans | null>(null);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const isPro = usePro();

  const loadPlans = () => api<Plans>("/payments/plans").then(setPlans).catch(() => {});
  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (!params.payment) return;
    if (params.payment === "active") {
      toast(t("payOk"));
      refreshUser();
      loadPlans();
    } else toast(t("payFail"), "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.payment]);

  const pay = async () => {
    if (!plans?.configured) {
      toast(t("payNotConfigured"), "error");
      return;
    }
    setPaying(true);
    try {
      const r = await startPayPalSubscription("profile");
      if (r === "redirected") return;
      if (r === "active") {
        toast(t("payOk"));
        await refreshUser();
        await loadPlans();
      } else toast(t("payFail"), "error");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setPaying(false);
    }
  };

  const cancel = async () => {
    setPaying(true);
    try {
      await api("/payments/cancel", { method: "POST" });
      toast(t("subCancelled"));
      await refreshUser();
      await loadPlans();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setPaying(false);
    }
  };

  const active = plans?.subscription?.status === "ACTIVE";
  const proOn = isPro || active;
  const price = plans?.price ?? FALLBACK_PRICE;

  return (
    <View style={styles.root} testID="profile-screen">
      <Header robot="profil" title={t("profileTitle")} subtitle={t("profileSubtitle")} hideAvatar />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomChrome + 28 + 32 }}>
        {/* ask Elon card: personal · employer · contact · employment tiles */}
        <ProfileCard proOn={proOn} />

        <View style={styles.segment}>
          {(["data", "docs"] as const).map((k) => (
            <Pressable key={k} testID={`profile-tab-${k}`} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={[styles.segItem, tab === k && styles.segOn, tab === k && fx("segmentActive")]}>
              <Ionicons name={k === "data" ? "id-card-outline" : "folder-open-outline"} size={16} color={tab === k ? colors.onBrandPrimary : colors.muted} />
              <Text style={[styles.segText, tab === k && styles.segTextOn]}>{k === "data" ? t("tabData") : t("tabDocs")}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "docs" ? (
          <View style={styles.pad}><DocumentsPanel /></View>
        ) : (
        <>
        <View style={styles.pad}>
          {editing || !user?.profile_complete ? (
            <ProfileForm onSaved={() => setEditing(false)} />
          ) : (
            <View style={[styles.section0, fx("cardShadow")]} testID="profile-view">
              <View style={styles.viewHead}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text style={styles.sectionTitle}>{t("secPersonal")} · {t("secEmployer")}</Text>
                  <Text style={styles.muted}>{t("pfEditHint")}</Text>
                </View>
                <Pressable testID="profile-edit-button" onPress={() => setEditing(true)} style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}>
                  <Ionicons name="create-outline" size={16} color={colors.brandPrimaryText} />
                  <Text style={styles.editText}>{t("edit")}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        <Pressable testID="profile-messages-row" onPress={() => router.push("/messages")} style={({ pressed }) => [styles.section, styles.msgRow, pressed ? fx("cardPressed") : fx("cardShadow")]}
          accessibilityRole="button" accessibilityLabel={unread > 0 ? `${t("msgTitle")}, ${t("msgUnreadA11y", { n: String(unread) })}` : t("msgTitle")}>
          <View style={styles.msgIcon}>
            <Ionicons name="mail-outline" size={20} color={colors.askOrange} />
            {unread > 0 && (
              <View style={[styles.msgBadge, fx("badgeGlow", colors.heritageOrangeSoft)]}><Text style={styles.msgBadgeText}>{unread > 9 ? "9+" : unread}</Text></View>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.msgTitle}>{t("msgTitle")}</Text>
            <Text style={styles.msgSub}>{withBrand(t("msgSubtitle"))}{unread > 0 ? ` · ${t("msgUnread", { n: String(unread) })}` : ""}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <View style={[styles.section, fx("cardShadow")]}>
          <Text style={styles.sectionTitle}>{t("language")}</Text>
          <LanguageSwitch />
        </View>

        <View style={[styles.section, fx("cardShadow")]} testID="membership-section">
          <Text style={styles.sectionTitle}>{withBrand(t("membership"))}</Text>
          <View style={styles.priceRow} testID="membership-price">
            <Text style={styles.price}>£{price}</Text>
            <Text style={styles.per}>/ {t("month")}</Text>
          </View>
          <Text style={styles.muted}>{withBrand(t("membershipSub"))}</Text>
          {active ? (
            <>
              <View style={styles.activeRow} testID="membership-active">
                <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimaryText} />
                <Text style={styles.activeText}>
                  {t("member")}
                  {plans?.subscription?.next_billing_time ? ` · ${t("nextBilling")}: ${formatDate(plans.subscription.next_billing_time, locale)}` : ""}
                </Text>
              </View>
              <Pressable testID="membership-cancel-button" onPress={cancel} disabled={paying} style={styles.cancel}>
                {paying ? <ActivityIndicator color={colors.error} /> : <Text style={styles.cancelText}>{t("cancelSub")}</Text>}
              </Pressable>
            </>
          ) : (
            <>
            {!isPro && (
            <Pressable testID="paypal-subscribe-button" onPress={pay} disabled={paying} style={({ pressed }) => [styles.subscribe, pressed ? fx("glowOrange") : fx("shadowOrangeSoft")]}>
              {paying ? <ActivityIndicator color={colors.askInk} /> : (
                <Text style={styles.subscribeText}>{t("payPal", { price })}</Text>
              )}
            </Pressable>
            )}
            <Pressable testID="membership-paywall-button" onPress={() => router.push("/paywall")} style={({ pressed }) => [styles.rcBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name={isPro ? "ribbon" : "sparkles"} size={18} color={colors.brandPrimaryText} />
              <Text style={styles.rcText}>{isPro ? t("pwActive") : t("pwOpen")}</Text>
            </Pressable>
            </>
          )}
        </View>

        <AdminAndContact />

        <Pressable testID="logout-button" onPress={signOut} style={styles.logout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>
        <Text style={styles.disclaimer} testID="profile-disclaimer">{withBrand(t("disclaimer"))}</Text>
        <SiteFooter testID="profile-footer" />
        </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  // segment
  segment: { flexDirection: "row", gap: 6, margin: 16, marginBottom: 0, padding: 4, borderRadius: 14, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  segItem: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: 3, borderBottomColor: "transparent" },
  segOn: { backgroundColor: c.brandPrimary, borderBottomColor: c.askOrange },
  segText: { color: c.muted, fontWeight: "700", fontSize: 14 },
  segTextOn: { color: c.onBrandPrimary },
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  section0: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: c.border },
  viewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: c.brandPrimaryBorder, backgroundColor: c.surfaceSecondary, flexShrink: 0 },
  editText: { color: c.brandPrimaryText, fontWeight: "800", fontSize: 13 },
  section: { marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  sectionTitle: { color: c.brandSecondaryText, fontSize: 12.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  muted: { color: c.muted, fontSize: 13, lineHeight: 19 },
  // messages row
  msgRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  msgIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.heritageOrangeSoft, alignItems: "center", justifyContent: "center" },
  msgBadge: { position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.askOrange, borderWidth: 2, borderColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  msgBadgeText: { color: c.onAccent, fontSize: 11, fontWeight: "900" },
  msgTitle: { color: c.brandSecondaryText, fontSize: 15, fontWeight: "800" },
  msgSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  chev: { color: c.brandPrimaryText, fontSize: 26, fontWeight: "700", lineHeight: 28 },
  // subscription
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { color: c.brandSecondaryText, fontSize: 32, fontWeight: "900" },
  per: { color: c.muted, fontSize: 15, fontWeight: "600" },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.brandPrimarySoft, borderRadius: 12, padding: 12 },
  activeText: { color: c.onSurface, fontSize: 13, fontWeight: "600", flex: 1 },
  cancel: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.error, alignItems: "center", justifyContent: "center" },
  cancelText: { color: c.error, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
  subscribe: { height: 50, borderRadius: 14, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  subscribeText: { color: c.onAccent, fontWeight: "800", fontSize: 15 },
  rcBtn: { height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: c.brandPrimaryBorder, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  rcText: { color: c.brandPrimaryText, fontWeight: "800", fontSize: 14 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, marginTop: 16 },
  logoutText: { color: c.error, fontWeight: "700", fontSize: 15 },
  disclaimer: { color: c.footnote, fontSize: 11, lineHeight: 16, textAlign: "center", marginHorizontal: 32, marginTop: 4 },
}));
