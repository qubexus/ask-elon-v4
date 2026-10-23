// PayPal membership (web fallback for PRO when no RevenueCat Web Billing key is set). Used by Profil and the paywall.
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { api } from "@/src/api";

export type PayPalSub = { subscription_id: string; status: string; next_billing_time?: string };
export type Plans = { configured: boolean; currency: string; price: string; interval: string; subscription: PayPalSub | null };

/** Fallback price shown when the store offerings are not available (same as the server's SUB_PRICE). */
export const FALLBACK_PRICE = "9.99";

/**
 * Starts a PayPal subscription. On web the browser leaves for PayPal and comes back to `returnPath`
 * with ?payment=… ("redirected"); on native it opens an auth session and verifies the result.
 */
export async function startPayPalSubscription(returnPath = "profile"): Promise<"redirected" | "active" | "failed"> {
  const redirect = Platform.OS === "web" ? `${window.location.origin}/${returnPath}` : Linking.createURL(returnPath);
  const res = await api<{ subscription_id: string; approve_url: string }>("/payments/subscribe", { method: "POST", body: { app_redirect: redirect } });
  if (Platform.OS === "web") {
    window.location.href = res.approve_url;
    return "redirected";
  }
  await WebBrowser.openAuthSessionAsync(res.approve_url, redirect);
  const sub = await api<PayPalSub>(`/payments/subscriptions/${res.subscription_id}/verify`, { method: "POST" });
  return sub.status === "ACTIVE" ? "active" : "failed";
}
