import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { usePro } from "@/src/revenuecat";
import { useAuth } from "@/src/auth";
import { AdminAndContact } from "@/src/components/AdminAndContact";
import { DocumentsPanel } from "@/src/components/DocumentsPanel";
import { LANG_FLAGS, LanguageSwitch } from "@/src/components/LanguageSwitch";
import { ProfileForm } from "@/src/components/ProfileForm";
import { useToast } from "@/src/components/Toast";
import { Header } from "@/src/components/Header";
import { formatDate } from "@/src/format";
import { useT } from "@/src/i18n";
import { useUnreadCount } from "@/src/inbox";
import { usesNativeTabs } from "@/src/navigation";
import { fx, makeStyles, useTheme } from "@/src/theme";

type Sub = { subscription_id: string; status: string; next_billing_time?: string };
type Plans = { configured: boolean; currency: string; price: string; interval: string; subscription: Sub | null };

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
      const redirect = Platform.OS === "web" ? window.location.origin + "/profile" : Linking.createURL("profile");
      const res = await api<{ subscription_id: string; approve_url: string }>("/payments/subscribe", { method: "POST", body: { app_redirect: redirect } });
      if (Platform.OS === "web") {
        window.location.href = res.approve_url;
        return;
      }
      await WebBrowser.openAuthSessionAsync(res.approve_url, redirect);
      const sub = await api<Sub>(`/payments/subscriptions/${res.subscription_id}/verify`, { method: "POST" });
      if (sub.status === "ACTIVE") {
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
  const price = plans?.price ?? "9.99";

  const initials = (user?.name || user?.email || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const accountId = user?.user_id ? `AE-${user.user_id.slice(-6).toUpperCase()}` : "";
  const createdAt = (user as any)?.created_at as string | undefined;
  const langName = t("langName");

  return (
    <View style={styles.root} testID="profile-screen">
      <Header robot="profil" title={t("profileTitle")} subtitle={t("profileSubtitle")} hideAvatar />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomChrome + 28 + 32 }}>
        {/* Ask Elon card */}
        <View style={[styles.cardOuter, fx("profileCardGlow")]} testID="profile-card">
          <LinearGradient colors={[colors.brandPrimary, colors.brandPrimaryDeep, colors.brandSecondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg}>
            <View style={styles.cardStripe} />
            <Image source={require("@/assets/brand/robot-watermark.png")} style={styles.watermark} contentFit="contain" accessible={false} alt="" />
            <View style={styles.cardTop}>
              <Text style={styles.cardKicker} numberOfLines={1}>
                {t("profileCard").toUpperCase().split("ASK ELON").map((part, i) => (
                  <Text key={i}>
                    {i > 0 && <Text style={styles.cardKickerBrand}>ASK ELON</Text>}
                    {part}
                  </Text>
                ))}
              </Text>
              <Text style={styles.cardTag} numberOfLines={1}>{t("profileCardTag").toUpperCase()}</Text>
            </View>
            <View style={styles.cardMid}>
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={styles.avatar} testID="profile-avatar" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initials}>{initials}</Text></View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} testID="profile-name" numberOfLines={2}>{user?.name}</Text>
                <Text style={styles.email} testID="profile-email" numberOfLines={1}>{user?.email}</Text>
              </View>
            </View>
            <View style={styles.pills}>
              {proOn ? (
                <View style={[styles.pill, styles.pillPro, fx("chipProGlow")]} testID="profile-member-badge">
                  <Text style={styles.pillProText}>★ {t("proActive")}</Text>
                </View>
              ) : (
                <View style={[styles.pill, styles.pillGlass]} testID="profile-no-sub-badge">
                  <Text style={styles.pillText}>{t("noSubscription")}</Text>
                </View>
              )}
              <View style={[styles.pill, styles.pillGlass]}>
                <Text style={styles.pillText}>{LANG_FLAGS[locale]} {langName}</Text>
              </View>
              {!!user?.industry && (
                <View style={[styles.pill, styles.pillGlass]}>
                  <Text style={styles.pillText} numberOfLines={1}>{user.industry}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardFoot}>
              <View style={{ flex: 1 }}>
                <Text style={styles.footLabel}>{t("accountId")}</Text>
                <Text style={styles.footVal} testID="profile-account-id">{accountId}</Text>
              </View>
              {!!createdAt && (
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.footLabel}>{t("accountSince")}</Text>
                  <Text style={styles.footVal}>{formatDate(createdAt, locale)}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </View>

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
                <Text style={[styles.sectionTitle, { flex: 1 }]}>{t("secPersonal")} · {t("secEmployer")}</Text>
                <Pressable testID="profile-edit-button" onPress={() => setEditing(true)} style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.8 }]}>
                  <Ionicons name="create-outline" size={16} color={colors.brandPrimary} />
                  <Text style={styles.editText}>{t("edit")}</Text>
                </Pressable>
              </View>
              {([
                ["person-outline", t("name"), user?.name],
                ["mail-outline", t("email"), user?.email],
                ["home-outline", t("homeAddress"), user?.address],
                ["call-outline", t("phone"), user?.phone],
                ["business-outline", t("employer"), user?.employer],
                ["layers-outline", t("industry"), user?.industry],
                ["briefcase-outline", t("jobTitle"), user?.job_title],
                ["document-text-outline", t("contractType"), user?.contract_type ? t(`ct_${user.contract_type}` as any) : ""],
                ["calendar-outline", t("startDate"), user?.start_date],
                ["location-outline", t("workplaceAddress"), user?.workplace_address],
                ["at-outline", t("hrEmail"), user?.hr_email],
              ] as [any, string, string | undefined][]).map(([icon, label, val]) => (
                <View key={label} style={styles.viewRow}>
                  <View style={styles.rowIcon}><Ionicons name={icon} size={18} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.viewLabel}>{label}</Text>
                    <Text style={styles.viewVal}>{val || "—"}</Text>
                  </View>
                </View>
              ))}
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
            <Text style={styles.msgSub}>{t("msgSubtitle")}{unread > 0 ? ` · ${t("msgUnread", { n: String(unread) })}` : ""}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <View style={[styles.section, fx("cardShadow")]}>
          <Text style={styles.sectionTitle}>{t("language")}</Text>
          <LanguageSwitch />
        </View>

        <View style={[styles.section, fx("cardShadow")]} testID="membership-section">
          <Text style={styles.sectionTitle}>{t("membership")}</Text>
          <View style={styles.priceRow} testID="membership-price">
            <Text style={styles.price}>£{price}</Text>
            <Text style={styles.per}>/ {t("month")}</Text>
          </View>
          <Text style={styles.muted}>{t("membershipSub")}</Text>
          {active ? (
            <>
              <View style={styles.activeRow} testID="membership-active">
                <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
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
              <Ionicons name={isPro ? "ribbon" : "sparkles"} size={18} color={colors.brandPrimary} />
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
        <Text style={styles.disclaimer} testID="profile-disclaimer">{t("disclaimer")}</Text>
        </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  // Ask Elon card
  cardOuter: { margin: 16, marginBottom: 0, borderRadius: 20 },
  cardBg: { borderRadius: 20, padding: 18, paddingLeft: 24, overflow: "hidden", gap: 14 },
  cardStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: c.askOrange },
  watermark: { position: "absolute", right: -34, bottom: -34, width: 150, height: 150, opacity: 0.15 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardKicker: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", letterSpacing: 1.4, flexShrink: 1 },
  cardKickerBrand: { color: c.askOrange },
  cardTag: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", letterSpacing: 1.4, flexShrink: 0 },
  cardMid: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: c.onBrandPrimary },
  avatarFallback: { backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center" },
  initials: { color: c.askInk, fontSize: 22, fontWeight: "900" },
  name: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "800" },
  email: { color: "rgba(255,255,255,0.78)", fontSize: 13, marginTop: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { height: 26, borderRadius: 999, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  pillPro: { backgroundColor: c.askOrange },
  pillProText: { color: c.askInk, fontSize: 12, fontWeight: "700" },
  pillGlass: { backgroundColor: c.glassFill, borderWidth: 1, borderColor: c.glassBorder },
  pillText: { color: c.onBrandPrimary, fontSize: 12, fontWeight: "700" },
  cardFoot: { flexDirection: "row", alignItems: "flex-end", borderTopWidth: 1, borderTopColor: c.glassDivider, paddingTop: 12 },
  footLabel: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600" },
  footVal: { color: c.onBrandPrimary, fontSize: 15, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  // segment
  segment: { flexDirection: "row", gap: 6, margin: 16, marginBottom: 0, padding: 4, borderRadius: 14, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  segItem: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: 3, borderBottomColor: "transparent" },
  segOn: { backgroundColor: c.brandPrimary, borderBottomColor: c.askOrange },
  segText: { color: c.muted, fontWeight: "700", fontSize: 14 },
  segTextOn: { color: c.onBrandPrimary },
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  section0: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: c.border },
  viewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: c.brandPrimary, backgroundColor: c.surfaceSecondary, flexShrink: 0 },
  editText: { color: c.brandPrimary, fontWeight: "800", fontSize: 13 },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.brandPrimarySoft, alignItems: "center", justifyContent: "center" },
  viewLabel: { color: c.muted, fontSize: 12, fontWeight: "500" },
  viewVal: { color: c.onSurface, fontSize: 15, fontWeight: "600", marginTop: 1 },
  section: { marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  sectionTitle: { color: c.brandSecondary, fontSize: 12.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  muted: { color: c.muted, fontSize: 13, lineHeight: 19 },
  // messages row
  msgRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  msgIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.heritageOrangeSoft, alignItems: "center", justifyContent: "center" },
  msgBadge: { position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: c.askOrange, borderWidth: 2, borderColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  msgBadgeText: { color: c.onBrandPrimary, fontSize: 11, fontWeight: "900" },
  msgTitle: { color: c.brandSecondary, fontSize: 15, fontWeight: "800" },
  msgSub: { color: c.muted, fontSize: 12, marginTop: 2 },
  chev: { color: c.brandPrimary, fontSize: 26, fontWeight: "700", lineHeight: 28 },
  // subscription
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { color: c.brandSecondary, fontSize: 32, fontWeight: "900" },
  per: { color: c.muted, fontSize: 15, fontWeight: "600" },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.brandPrimarySoft, borderRadius: 12, padding: 12 },
  activeText: { color: c.onSurface, fontSize: 13, fontWeight: "600", flex: 1 },
  cancel: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.error, alignItems: "center", justifyContent: "center" },
  cancelText: { color: c.error, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
  subscribe: { height: 50, borderRadius: 14, backgroundColor: c.askOrange, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  subscribeText: { color: c.askInk, fontWeight: "800", fontSize: 15 },
  rcBtn: { height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: c.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  rcText: { color: c.brandPrimary, fontWeight: "800", fontSize: 14 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, marginTop: 16 },
  logoutText: { color: c.error, fontWeight: "700", fontSize: 15 },
  disclaimer: { color: c.footnote, fontSize: 11, lineHeight: 16, textAlign: "center", marginHorizontal: 32, marginTop: 4 },
}));
