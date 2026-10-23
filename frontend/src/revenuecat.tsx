import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
// Web Billing public key (rcb_...). react-native-purchases runs purchases-js in the browser with it.
const REVENUECAT_WEB_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

/** Public SDK key for this platform/build, or null when none is set (the app then falls back to PayPal). */
function getRevenueCatApiKey(): string | null {
  const pick = (...keys: (string | undefined)[]) => keys.find((k) => !!k && !k.includes("placeholder")) ?? null;
  if (Platform.OS === "web") return pick(REVENUECAT_WEB_API_KEY, __DEV__ ? REVENUECAT_TEST_API_KEY : undefined);
  if (__DEV__ && REVENUECAT_TEST_API_KEY) return REVENUECAT_TEST_API_KEY; // never ship a Test Store key in release
  if (Platform.OS === "ios") return pick(REVENUECAT_IOS_API_KEY);
  if (Platform.OS === "android") return pick(REVENUECAT_ANDROID_API_KEY);
  return null;
}

const RC_KEY = getRevenueCatApiKey();
export const rcEnabled = !!RC_KEY;
export const rcSimulated = !!RC_KEY && RC_KEY.startsWith("test_"); // Test Store purchases are simulated

let rcConfigured = false;
export function initializeRevenueCat() {
  if (!RC_KEY || rcConfigured) return;
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: RC_KEY });
    rcConfigured = true;
  } catch (e) {
    console.warn("[RevenueCat] configure failed", e);
  }
}

export type BillingStatus = {
  is_pro: boolean;
  source: "admin" | "revenuecat" | "paypal_or_admin" | null;
  revenuecat_configured: boolean;
  revenuecat: { active: boolean; expires_at: string | null; product_id: string | null; store: string | null; environment: string | null };
};

/** Asks our server to re-check RevenueCat (after a purchase/restore) and refreshes the user's is_pro flag. */
async function syncServer(refreshUser: () => Promise<void>): Promise<BillingStatus | null> {
  let st: BillingStatus | null = null;
  try {
    st = await api<BillingStatus>("/billing/revenuecat/sync", { method: "POST" });
  } catch {
    st = await api<BillingStatus>("/billing/status").catch(() => null);
  }
  await refreshUser().catch(() => {});
  return st;
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const rcIdentityRef = useRef<string | null>(null);
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);

  // Bind RevenueCat to the stable backend user id on every auth path (restore, sign-in, sign-up).
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.user_id && rcIdentityRef.current !== user.user_id) {
          const { customerInfo } = await Purchases.logIn(user.user_id);
          rcIdentityRef.current = user.user_id;
          queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
          setPurchaseIdentityError(null);
          console.log("[RevenueCat] identity bound:", customerInfo.originalAppUserId);
        } else if (!user?.user_id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
          queryClient.removeQueries({ queryKey: ["revenuecat", "customer-info"] });
        }
      } catch (e) {
        setPurchaseIdentityError(String(e));
      }
    })();
  }, [user?.user_id, queryClient]);

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled: rcEnabled && !!user,
    staleTime: 60 * 1000,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    enabled: rcEnabled && !!user,
    staleTime: 300 * 1000,
  });

  useEffect(() => {
    if (!rcEnabled) return;
    const listener = (info: CustomerInfo) => queryClient.setQueryData(["revenuecat", "customer-info"], info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient]);

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const id = (await Purchases.getCustomerInfo()).originalAppUserId;
      if (id.startsWith("$RCAnonymousID:")) throw new Error("identity_not_ready");
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      await syncServer(refreshUser); // server stores PRO in MongoDB (pro_status) from RevenueCat's REST API
      return customerInfo;
    },
  });

  /** Restore: store purchases (if the SDK is on) + a fresh server-side check. Resolves to "is PRO now". */
  const restoreMutation = useMutation({
    mutationFn: async () => {
      let storePro = false;
      if (rcEnabled) {
        const info = await Purchases.restorePurchases();
        queryClient.setQueryData(["revenuecat", "customer-info"], info);
        storePro = info.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
      }
      const st = await syncServer(refreshUser);
      return storePro || !!st?.is_pro;
    },
  });

  const isSubscribed = customerInfoQuery.data?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  const originalAppUserId = customerInfoQuery.data?.originalAppUserId;
  const identityReady = !!originalAppUserId && !originalAppUserId.startsWith("$RCAnonymousID:");

  return {
    customerInfo: customerInfoQuery.data,
    offerings: offeringsQuery.data,
    offeringsError: offeringsQuery.error,
    isSubscribed,
    identityReady,
    purchaseIdentityError,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useSubscription must be used within a SubscriptionProvider");
  return ctx;
}

/** PRO = active RevenueCat "pro" entitlement (SDK or server-verified), or PayPal / admin membership. */
export function usePro() {
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  return isSubscribed || !!user?.is_pro || !!user?.is_member;
}
