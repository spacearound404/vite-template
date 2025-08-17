import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authWithTelegram, fetchMe } from "@/lib/api";

type AuthContextValue = {
  token: string | null;
  user: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "tg_jwt";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

function getTelegramInitData(): string | null {
  const anyWindow = window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } };
  const initData = anyWindow?.Telegram?.WebApp?.initData;
  return initData && initData.length > 0 ? initData : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        // If already have token, try fetch /users/me
        if (token) {
          const me = await fetchMe(token);
          if (!cancelled) setUser(me.user);
          return;
        }

        const initData = getTelegramInitData();
        if (!initData) {
          // Not in Telegram or no initData: stay unauthenticated but not an error
          return;
        }
        const res = await authWithTelegram(initData);
        if (cancelled) return;
        setToken(res.access_token);
        localStorage.setItem(STORAGE_KEY, res.access_token);
        setUser(res.user);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Auth error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(() => ({ token, user, loading, error, logout }), [token, user, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


