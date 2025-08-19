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
  try {
    const fromGlobal = (window as any)?.__TG_INIT_DATA;
    if (typeof fromGlobal === "string" && fromGlobal.length > 0) return fromGlobal;
    const anyWindow = window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } };
    try { anyWindow?.Telegram?.WebApp?.ready?.(); } catch {}
    const initData = anyWindow?.Telegram?.WebApp?.initData;
    if (initData && initData.length > 0) return initData;
  } catch {}

  // Fallbacks: some environments pass init data via URL
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromSearch = qs.get("tgWebAppData") || qs.get("telegram_init_data");
    if (fromSearch && fromSearch.length > 0) return fromSearch;
  } catch {}

  try {
    const raw = window.location.hash || "";
    const body = raw.startsWith('#') ? raw.slice(1) : raw;
    const query = body.includes('?') ? body.split('?')[1] : body;
    if (query) {
      const hqs = new URLSearchParams(query);
      const fromHash = hqs.get("tgWebAppData") || hqs.get("telegram_init_data");
      if (fromHash && fromHash.length > 0) return fromHash;
    }
  } catch {}

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dev-only: hardcode bot token to synthesize initData when running outside Telegram
  const HARDCODED_TG_BOT_TOKEN = "8248857120:AAHfpERo6wbWWvrk0C6abh9jJr2pKDgpuE8";

  useEffect(() => {
    let cancelled = false;
    const waitForInitData = async (maxMs = 1500, stepMs = 50): Promise<string | null> => {
      const started = Date.now();
      while (Date.now() - started < maxMs) {
        const init = getTelegramInitData();
        if (init && init.length > 0) return init;
        await new Promise((r) => setTimeout(r, stepMs));
      }
      return null;
    };
    async function init() {
      setLoading(true);
      setError(null);
      try {
        // Dev helper: allow passing JWT via URL (?jwt=... or ?token=...)
        try {
          const qs = new URLSearchParams(window.location.search);
          const qToken = qs.get("jwt") || qs.get("token");
          if (qToken) {
            localStorage.setItem(STORAGE_KEY, qToken);
            setToken(qToken);
            const me = await fetchMe(qToken);
            if (!cancelled) setUser(me.user);
            try { window.dispatchEvent(new CustomEvent("projects:changed", { detail: { type: "auth" } })); } catch {}
            // Clean query string
            try { window.history.replaceState({}, document.title, window.location.pathname + window.location.hash); } catch {}
            return;
          }
        } catch {}

        // Dev fallback: token from env (VITE_DEV_JWT)
        try {
          const envToken = (import.meta as any)?.env?.VITE_DEV_JWT as string | undefined;
          if (envToken && typeof envToken === 'string' && envToken.length > 0) {
            localStorage.setItem(STORAGE_KEY, envToken);
            setToken(envToken);
            const me = await fetchMe(envToken);
            if (!cancelled) setUser(me.user);
            try { window.dispatchEvent(new CustomEvent("projects:changed", { detail: { type: "auth" } })); } catch {}
            return;
          }
        } catch {}

        // If already have token, try fetch /users/me; on failure, clear and continue to Telegram auth
        if (token) {
          try {
            const me = await fetchMe(token);
            if (!cancelled) setUser(me.user);
            try { window.dispatchEvent(new CustomEvent("projects:changed", { detail: { type: "auth" } })); } catch {}
            return;
          } catch {
            try { localStorage.removeItem(STORAGE_KEY); } catch {}
            setToken(null);
            // continue to Telegram auth
          }
        }

        let initData = getTelegramInitData();
        if (!initData) {
          // Give Telegram WebApp a brief moment to populate initData
          initData = await waitForInitData();
          if (!initData && HARDCODED_TG_BOT_TOKEN) {
            try {
              // Dev fallback: synthesize initData using bot token to get JWT outside Telegram
              initData = await synthesizeInitData(HARDCODED_TG_BOT_TOKEN);
              (window as any).__TG_INIT_DATA = initData;
            } catch {}
          }
          if (!initData) {
            // Not in Telegram or no initData: stay unauthenticated but not an error
            return;
          }
        }
        try {
          const res = await authWithTelegram(initData);
          if (cancelled) return;
          setToken(res.access_token);
          localStorage.setItem(STORAGE_KEY, res.access_token);
          setUser(res.user);
          try { window.dispatchEvent(new CustomEvent("projects:changed", { detail: { type: "auth" } })); } catch {}
          return;
        } catch (e) {
          // if Telegram auth fails, remain unauthenticated
        }
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

  // Log Telegram initData on load for convenient copy from console
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const waitFor = async (maxMs = 2000, stepMs = 50) => {
        const started = Date.now();
        let v = getTelegramInitData();
        while (!v && Date.now() - started < maxMs) {
          await new Promise((r) => setTimeout(r, stepMs));
          v = getTelegramInitData();
        }
        return v;
      };
      let initData = await waitFor();
      if (!initData && HARDCODED_TG_BOT_TOKEN) {
        try {
          initData = await synthesizeInitData(HARDCODED_TG_BOT_TOKEN);
          (window as any).__TG_INIT_DATA = initData;
        } catch {}
      }
      if (cancelled) return;
      try {
        if (initData) {
          (window as any).__TG_INIT_DATA = initData;
          // eslint-disable-next-line no-console
          console.log("[TG initData] window.__TG_INIT_DATA set. Value:\n" + initData);
        } else {
          // eslint-disable-next-line no-console
          console.log("[TG initData] not found");
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Gate children until auth initialization completes to avoid unauthenticated API calls
  return (
    <AuthContext.Provider value={value}>
      {loading ? null : children}
    </AuthContext.Provider>
  );
}

async function synthesizeInitData(botToken: string): Promise<string> {
  const enc = new TextEncoder();
  const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  const sha256 = async (msg: string) => crypto.subtle.digest("SHA-256", enc.encode(msg));
  const hmacSha256Hex = async (keyRaw: ArrayBuffer, msg: string) => {
    const key = await crypto.subtle.importKey("raw", keyRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
    return toHex(sig);
  };

  const payload: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 1, is_bot: false, first_name: "Dev", last_name: "User", username: "dev", language_code: "en" }),
    query_id: "dev-query",
  };
  const keys = Object.keys(payload).sort();
  const lines = keys.map((k) => `${k}=${payload[k]}`);
  const dataCheckString = lines.join("\n");
  const secret = await sha256(botToken);
  const hashHex = await hmacSha256Hex(secret, dataCheckString);
  const qs = keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(payload[k])}`).join("&");
  return `${qs}&hash=${hashHex}`;
}


