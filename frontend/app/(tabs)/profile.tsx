import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
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
import { LanguageSwitch } from "@/src/components/LanguageSwitch";
import { ProfileForm } from "@/src/components/ProfileForm";
import { useToast } from "@/src/components/Toast";
import { useT } from "@/src/i18n";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, useTheme } from "@/src/theme";

type Sub = { subscription_id: string; status: string; next_billing_time?: string };
type Plans = { configured: boolean; currency: string; price: string; interval: string; subscription: Sub | null };

export default function Profile() {
  const { user, signOut, refreshUser } = useAuth();
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

  const initials = (user?.name || user?.email || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <View style={styles.root} testID="profile-screen">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomChrome + 52 }}>
        <View style={[styles.hero, { paddingTop: insets.top + 24 }]}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} testID="profile-avatar" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initials}>{initials}</Text></View>
          )}
          <Text style={styles.name} testID="profile-name">{user?.name}</Text>
          <Text style={styles.email} testID="profile-email">{user?.email}</Text>
          {isPro && (
            <View style={styles.badge} testID="profile-member-badge">
              <Ionicons name="ribbon" size={14} color={colors.onGold} />
              <Text style={styles.badgeText}>{t("member")}</Text>
            </View>
          )}
        </View>

        <View style={styles.segment}>
          {(["data", "docs"] as const).map((k) => (
            <Pressable key={k} testID={`profile-tab-${k}`} onPress={() => setTab(k)} style={[styles.segItem, tab === k && styles.segOn]}>
              <Ionicons name={k === "data" ? "id-card-outline" : "folder-open-outline"} size={16} color={tab === k ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
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
            <View style={styles.section0} testID="profile-view">
              <View style={styles.viewHead}>
                <Text style={styles.sectionTitle}>{t("secPersonal")} · {t("secEmployer")}</Text>
                <Pressable testID="profile-edit-button" onPress={() => setEditing(true)} style={styles.editBtn}>
                  <Ionicons name="create-outline" size={16} color={colors.onBrandPrimary} />
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
                  <Ionicons name={icon} size={18} color={colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewLabel}>{label}</Text>
                    <Text style={styles.viewVal}>{val || "—"}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("language")}</Text>
          <LanguageSwitch />
        </View>

        <View style={styles.section} testID="membership-section">
          <Text style={styles.sectionTitle}>{t("membership")}</Text>
          <Text style={styles.muted}>{t("membershipSub")}</Text>
          <View style={styles.priceRow} testID="membership-price">
            <Text style={styles.price}>£{plans?.price ?? "9.99"}</Text>
            <Text style={styles.per}>/ {t("month")}</Text>
          </View>
          {active ? (
            <>
              <View style={styles.activeRow} testID="membership-active">
                <Ionicons name="ribbon" size={18} color={colors.gold} />
                <Text style={styles.activeText}>
                  {t("member")}
                  {plans?.subscription?.next_billing_time ? ` · ${t("nextBilling")}: ${new Date(plans.subscription.next_billing_time).toLocaleDateString()}` : ""}
                </Text>
              </View>
              <Pressable testID="membership-cancel-button" onPress={cancel} disabled={paying} style={styles.cancel}>
                {paying ? <ActivityIndicator color={colors.error} /> : <Text style={styles.cancelText}>{t("cancelSub")}</Text>}
              </Pressable>
            </>
          ) : (
            <>
            <Pressable testID="membership-paywall-button" onPress={() => router.push("/paywall")} style={styles.rcBtn}>
              <Ionicons name={isPro ? "ribbon" : "sparkles"} size={18} color={colors.onBrandPrimary} />
              <Text style={styles.rcText}>{isPro ? t("pwActive") : t("pwOpen")}</Text>
            </Pressable>
            {!isPro && (
            <Pressable testID="paypal-subscribe-button" onPress={pay} disabled={paying} style={styles.paypal}>
              {paying ? <ActivityIndicator color="#003087" /> : (
                <>
                  <Ionicons name="logo-paypal" size={20} color="#003087" />
                  <Text style={styles.paypalText}>{t("payPal")}</Text>
                </>
              )}
            </Pressable>
            )}
            </>
          )}
        </View>

        <AdminAndContact />

        <Pressable testID="logout-button" onPress={signOut} style={styles.logout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>{t("logout")}</Text>
        </Pressable>
        </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { backgroundColor: c.brandSecondary, alignItems: "center", paddingBottom: 28, gap: 6, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: c.brandTertiary },
  avatarFallback: { backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  initials: { color: c.onBrandPrimary, fontSize: 28, fontWeight: "800" },
  name: { color: c.onBrandSecondary, fontSize: 20, fontWeight: "900", marginTop: 6 },
  email: { color: c.onBrandSecondary, opacity: 0.7, fontSize: 13 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.gold, borderRadius: 999, paddingHorizontal: 12, height: 28, marginTop: 6 },
  badgeText: { color: c.onGold, fontWeight: "700", fontSize: 12 },
  segment: { flexDirection: "row", gap: 6, margin: 16, marginBottom: 0, padding: 4, borderRadius: 14, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  segItem: { flex: 1, minHeight: 44, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  segOn: { backgroundColor: c.brandPrimary },
  segText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 14 },
  segTextOn: { color: c.onBrandPrimary },
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  section0: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  viewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: c.brandPrimary },
  editText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 13 },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.divider },
  viewLabel: { color: c.muted, fontSize: 12, fontWeight: "600" },
  viewVal: { color: c.onSurface, fontSize: 15, fontWeight: "600", paddingBottom: 6 },
  section: { marginHorizontal: 16, marginTop: 16, backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  sectionTitle: { color: c.onSurface, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  muted: { color: c.muted, fontSize: 13, lineHeight: 19 },
  label: { color: c.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
  input: { backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, color: c.onSurface },
  cta: { minHeight: 48, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginTop: 4, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  ctaText: { color: c.onBrandPrimary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { color: c.gold, fontSize: 32, fontWeight: "900" },
  per: { color: c.muted, fontSize: 15, fontWeight: "600" },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.goldSoft, borderRadius: 12, padding: 12 },
  activeText: { color: c.onSurface, fontSize: 13, fontWeight: "600", flex: 1 },
  cancel: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: c.error, alignItems: "center", justifyContent: "center" },
  cancelText: { color: c.error, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8, fontSize: 14 },
  rcBtn: { height: 50, borderRadius: 25, backgroundColor: c.heritageOrange, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 },
  rcText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  paypal: { height: 50, borderRadius: 25, backgroundColor: "#FFC439", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  paypalText: { color: "#003087", fontWeight: "800", fontSize: 15 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52, marginTop: 16 },
  logoutText: { color: c.error, fontWeight: "700", fontSize: 15 },
}));
