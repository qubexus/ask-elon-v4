import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, setApiToken, setUnauthorizedHandler } from "@/src/api";
import { Locale } from "@/src/i18n";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

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
  demoLogin: () => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const extractSessionId = (url?: string | null) => url?.match(/[?#&]session_id=([^&#]+)/)?.[1] ?? null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [localLocale, setLocalLocale] = useState<Locale>("pl");
  const sent = useRef(new Set<string>());

  const clear = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setApiToken(null);
    setUserState(null);
  }, []);

  const exchange = useCallback(async (sessionId: string) => {
    if (sent.current.has(sessionId)) return false;
    sent.current.add(sessionId);
    try {
      const res = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
      });
      await storage.secureSet(TOKEN_KEY, res.session_token);
      setApiToken(res.session_token);
      setUserState(res.user);
      return true;
    } catch (e) {
      console.warn("Session exchange failed", e);
      return false;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    let sub: { remove: () => void } | undefined;
    (async () => {
      const savedLocale = await storage.getItem(LOCALE_KEY, "pl");
      setLocalLocale((savedLocale as Locale) ?? "pl");
      // 1. A fresh session_id in the URL wins.
      let sid: string | null = null;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        sid = extractSessionId(window.location.href);
      } else {
        sid = extractSessionId(await Linking.getInitialURL());
      }
      if (sid && (await exchange(sid))) {
        if (Platform.OS === "web") {
          const url = new URL(window.location.href);
          url.searchParams.delete("session_id");
          url.hash = url.hash.replace(/session_id=[^&]*&?/, "").replace(/^#$/, "");
          window.history.replaceState(window.history.state, "", url.toString());
        }
        setLoading(false);
        return;
      }
      // 2. Existing token.
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
    if (Platform.OS !== "web") {
      sub = Linking.addEventListener("url", ({ url }) => {
        const s = extractSessionId(url);
        if (s) exchange(s);
      });
    }
    return () => sub?.remove();
  }, [clear, exchange]);

  const signIn = useCallback(async () => {
    const redirect = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    let captured: string | null = null;
    const listener = Linking.addEventListener("url", ({ url }) => {
      if (extractSessionId(url)) captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      const url = (result.type === "success" ? result.url : null) ?? captured ?? (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } finally {
      listener.remove();
    }
  }, [exchange]);

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
  const demoLogin = useCallback(async () => persist(await api("/auth/demo", { method: "POST" })), [persist]);
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
      value={{ user, loading, locale, setLocale, signIn, signOut, setUser: setUserState, refreshUser, emailLogin, emailRegister, demoLogin, resetPassword }}
    >
      {children}
    </Ctx.Provider>
  );
}
