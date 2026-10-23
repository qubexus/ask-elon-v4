import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, setApiToken, setUnauthorizedHandler } from "@/src/api";
import { Locale } from "@/src/i18n";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

// Google Sign-In (standard Google OAuth). Client IDs come from Google Cloud Console → Credentials.
// If the ID for the current platform is empty, the Google button is hidden and e-mail login is used.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || "";
export const googleEnabled = !!Platform.select({
  web: GOOGLE_WEB_CLIENT_ID,
  ios: GOOGLE_IOS_CLIENT_ID,
  android: GOOGLE_ANDROID_CLIENT_ID,
  default: "",
});

type Pending = { resolve: () => void; reject: (e: Error) => void } | null;

// Mounted only when Google is configured for this platform (the hook throws without a client ID).
function GoogleBridge({
  promptRef,
  onIdToken,
  pending,
}: {
  promptRef: React.MutableRefObject<(() => Promise<unknown>) | null>;
  onIdToken: (idToken: string) => Promise<void>;
  pending: React.MutableRefObject<Pending>;
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    selectAccount: true,
    // Web: Google sends the user back to the app's main address (add it in Google Cloud Console →
    // Authorized redirect URIs, e.g. http://localhost:8081 and your production web address).
    ...(Platform.OS === "web" && typeof window !== "undefined" ? { redirectUri: window.location.origin } : {}),
  });
  useEffect(() => {
    promptRef.current = request ? () => promptAsync() : null;
    return () => {
      promptRef.current = null;
    };
  }, [request, promptAsync, promptRef]);
  useEffect(() => {
    if (!response) return;
    const done = pending.current;
    pending.current = null;
    if (response.type !== "success") {
      if (response.type === "error") done?.reject(new Error(response.error?.message || "Google login failed"));
      else done?.resolve(); // cancelled / dismissed
      return;
    }
    const idToken = (response.params as any)?.id_token || (response as any).authentication?.idToken;
    if (!idToken) {
      done?.reject(new Error("Google login failed"));
      return;
    }
    onIdToken(idToken).then(() => done?.resolve(), (e) => done?.reject(e));
  }, [response, onIdToken, pending]);
  return null;
}

const TOKEN_KEY = "union_session_token";
const LOCALE_KEY = "union_locale";

export type User = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  employer: string;
  job_title: string;
  locale: Locale;
  is_member?: boolean;
  /** Computed by the server: admin, PayPal/admin membership or an active RevenueCat entitlement. */
  is_pro?: boolean;
  member_plan?: string;
  onboarded?: boolean;
  profile_complete?: boolean;
  role?: "admin" | "user";
  address?: string;
  phone?: string;
  industry?: string;
  contract_type?: string;
  start_date?: string;
  workplace_address?: string;
  employer_company_number?: string;
  hr_email?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  locale: Locale;
  setLocale: (l: Locale) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  refreshUser: () => Promise<void>;
  emailLogin: (email: string, password: string) => Promise<void>;
  emailRegister: (name: string, email: string, password: string) => Promise<void>;
  googleEnabled: boolean;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [localLocale, setLocalLocale] = useState<Locale>("pl");
  const googlePrompt = useRef<(() => Promise<unknown>) | null>(null);
  const googlePending = useRef<Pending>(null);

  const clear = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setApiToken(null);
    setUserState(null);
  }, []);

  const exchangeGoogle = useCallback(async (idToken: string) => {
    const res = await api<{ session_token: string; user: User }>("/auth/google", {
      method: "POST",
      body: { id_token: idToken },
    });
    await storage.secureSet(TOKEN_KEY, res.session_token);
    setApiToken(res.session_token);
    setUserState(res.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    (async () => {
      const savedLocale = await storage.getItem(LOCALE_KEY, "pl");
      setLocalLocale((savedLocale as Locale) ?? "pl");
      const t = await storage.secureGet(TOKEN_KEY, null);
      if (typeof t === "string" && t) {
        setApiToken(t);
        try {
          setUserState(await api<User>("/auth/me"));
        } catch {
          await clear();
        }
      }
      setLoading(false);
    })();
  }, [clear]);

  const signIn = useCallback(async () => {
    if (!googleEnabled || !googlePrompt.current) throw new Error("Google login is not available");
    const done = new Promise<void>((resolve, reject) => {
      googlePending.current = { resolve, reject };
    });
    await googlePrompt.current();
    await done;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clear();
  }, [clear]);

  const refreshUser = useCallback(async () => {
    setUserState(await api<User>("/auth/me"));
  }, []);

  const persist = useCallback(async (res: { session_token: string; user: User }) => {
    await storage.secureSet(TOKEN_KEY, res.session_token);
    setApiToken(res.session_token);
    setUserState(res.user);
  }, []);

  const emailLogin = useCallback(
    async (email: string, password: string) => persist(await api("/auth/login", { method: "POST", body: { email, password } })),
    [persist],
  );
  const emailRegister = useCallback(
    async (name: string, email: string, password: string) =>
      persist(await api("/auth/register", { method: "POST", body: { name, email, password } })),
    [persist],
  );
  const resetPassword = useCallback(
    async (email: string, code: string, new_password: string) =>
      persist(await api("/auth/reset-password", { method: "POST", body: { email, code, new_password } })),
    [persist],
  );

  const setLocale = useCallback(
    async (l: Locale) => {
      setLocalLocale(l);
      await storage.setItem(LOCALE_KEY, l);
      if (user) setUserState(await api<User>("/profile", { method: "PUT", body: { locale: l } }));
    },
    [user],
  );

  const locale = user?.locale ?? localLocale;

  return (
    <Ctx.Provider
      value={{ user, loading, locale, setLocale, signIn, signOut, setUser: setUserState, refreshUser, emailLogin, emailRegister, googleEnabled, resetPassword }}
    >
      {googleEnabled ? <GoogleBridge promptRef={googlePrompt} onIdToken={exchangeGoogle} pending={googlePending} /> : null}
      {children}
    </Ctx.Provider>
  );
}
