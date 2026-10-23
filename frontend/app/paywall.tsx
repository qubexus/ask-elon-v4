import Ionicons from "@react-native-vector-icons/ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BRAND_PLAIN, withBrand } from "@/src/components/BrandName";
import { Header } from "@/src/components/Header";
import { useToast } from "@/src/components/Toast";
import { StringKey, useT } from "@/src/i18n";
import { rcSimulated, usePro, useSubscription } from "@/src/revenuecat";
import { makeStyles, useTheme } from "@/src/theme";

const PERKS: [any, StringKey][] = [
  ["chatbubbles", "pwPerk1"],
  ["document-text", "pwPerk2"],
  ["scan", "pwPerk3"],
  ["stats-chart", "pwPerk4"],
  ["people", "pwPerk5"],
];

export default function Paywall() {
  const t = useT();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isPro = usePro();
  const { offerings, isLoading, purchase, restore, isPurchasing, isRestoring, identityReady, purchaseIdentityError } = useSubscription();
  const [confirm, setConfirm] = useState(false);

  const pkg = offerings?.current?.monthly ?? offerings?.current?.availablePackages[0];
  const price = pkg?.product.priceString;

  const buy = async () => {
    setConfirm(false);
    if (!pkg) return;
    try {
      const info = await purchase(pkg);
      if (info.entitlements.active.pro) {
        toast(t("pwSuccess"));
        router.back();
      }
    } catch (e: any) {
      if (e?.userCancelled) return;
      toast(e?.message === "identity_not_ready" ? t("pwIdentity") : e?.message ?? String(e), "error");
    }
  };

  const doRestore = async () => {
    try {
      const info = await restore();
      toast(info.entitlements.active.pro ? t("pwRestored") : t("pwNothing"), info.entitlements.active.pro ? "success" : "error");
    } catch (e: any) {
      toast(e?.message ?? String(e), "error");
    }
  };

  return (
    <View style={styles.root} testID="paywall-screen">
      <Header back title={`${BRAND_PLAIN} PRO`} subtitle={t("membership")} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.hero}>
          <Ionicons name="ribbon" size={40} color={colors.gold} />
          <Text style={styles.heroTitle}>{withBrand(t("pwTitle"))}</Text>
          <Text style={styles.heroSub}>{t("pwSub")}</Text>
        </View>

        {PERKS.map(([icon, key]) => (
          <View key={key} style={styles.perk}>
            <View style={styles.perkIcon}><Ionicons name={icon} size={18} color={colors.success} /></View>
            <Text style={styles.perkText}>{t(key)}</Text>
          </View>
        ))}

        {rcSimulated && (
          <View style={styles.sim} testID="paywall-simulated">
            <Ionicons name="flask-outline" size={16} color={colors.warning} />
            <Text style={styles.simText}>{t("pwSimulated")}</Text>
          </View>
        )}
        {!!purchaseIdentityError && (
          <View style={styles.err} testID="paywall-identity-error">
            <Text style={styles.errText}>{t("pwIdentity")} ({purchaseIdentityError})</Text>
          </View>
        )}

        {isPro ? (
          <View style={styles.active} testID="paywall-active">
            <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            <Text style={styles.activeText}>{t("pwActive")}</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator color={colors.heritageOrange} style={{ marginVertical: 20 }} />
        ) : !pkg ? (
          <Text style={styles.unavailable} testID="paywall-unavailable">{t("pwUnavailable")}</Text>
        ) : (
          <Pressable
            testID="paywall-subscribe-button"
            onPress={() => (rcSimulated ? setConfirm(true) : buy())}
            disabled={isPurchasing || !identityReady}
            style={({ pressed }) => [styles.buy, (isPurchasing || !identityReady) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
          >
            {isPurchasing ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Text style={styles.buyText}>{t("pwSubscribe")}</Text>
                <Text style={styles.buyPrice} testID="paywall-price">{price} / {t("month")}</Text>
              </>
            )}
          </Pressable>
        )}

        {!isPro && !!pkg && !identityReady && !purchaseIdentityError && (
          <Text style={styles.legal} testID="paywall-preparing">{t("pwPreparing")}</Text>
        )}
        <Pressable testID="paywall-restore-button" onPress={doRestore} disabled={isRestoring} style={styles.restore}>
          {isRestoring ? <ActivityIndicator color={colors.brandPrimaryText} /> : <Text style={styles.restoreText}>{t("pwRestore")}</Text>}
        </Pressable>
        <Text style={styles.legal}>{t("pwLegal")}</Text>
      </ScrollView>

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal} testID="paywall-confirm-modal">
            <Text style={styles.modalTitle}>{t("pwConfirmTitle")}</Text>
            <Text style={styles.modalText}>{withBrand(t("pwConfirmText", { price: price ?? "" }))}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable testID="paywall-confirm-cancel" onPress={() => setConfirm(false)} style={[styles.restore, { flex: 1, marginTop: 0 }]}>
                <Text style={styles.restoreText}>{t("cancel")}</Text>
              </Pressable>
              <Pressable testID="paywall-confirm-buy" onPress={buy} style={[styles.buy, { flex: 1, marginTop: 0, minHeight: 48 }]}>
                <Text style={styles.buyText}>{t("pwConfirmBuy")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.heritageCream },
  body: { padding: 20, gap: 12 },
  hero: { alignItems: "center", gap: 8, paddingVertical: 12 },
  heroTitle: { color: c.onSurface, fontSize: 24, fontWeight: "900", textAlign: "center" },
  heroSub: { color: c.onSurfaceTertiary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  perk: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border },
  perkIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.successSoft, alignItems: "center", justifyContent: "center" },
  perkText: { flex: 1, color: c.onSurface, fontSize: 14, fontWeight: "600" },
  sim: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: c.warningSoft, borderRadius: 10, padding: 10 },
  simText: { flex: 1, color: c.onSurface, fontSize: 12, fontWeight: "600" },
  err: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.error, borderRadius: 10, padding: 10 },
  errText: { color: c.error, fontSize: 12, fontWeight: "700" },
  active: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 16, borderRadius: 14, backgroundColor: c.successSoft },
  activeText: { color: c.onSurface, fontWeight: "800", fontSize: 15 },
  unavailable: { color: c.muted, textAlign: "center", padding: 16 },
  buy: { marginTop: 8, minHeight: 60, borderRadius: 14, backgroundColor: c.heritageOrange, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buyText: { color: c.onAccent, fontWeight: "900", fontSize: 16, textTransform: "uppercase", letterSpacing: 0.6 },
  buyPrice: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 13, opacity: 0.9 },
  restore: { marginTop: 4, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  restoreText: { color: c.brandPrimaryText, fontWeight: "700" },
  legal: { color: c.muted, fontSize: 11, textAlign: "center", lineHeight: 16 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { width: "100%", maxWidth: 380, backgroundColor: c.surfaceSecondary, borderRadius: 18, padding: 20, gap: 12 },
  modalTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" },
  modalText: { color: c.onSurfaceTertiary, fontSize: 14, lineHeight: 20 },
}));
