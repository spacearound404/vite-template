export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: Record<string, unknown>;
};

export type MeResponse = { user: Record<string, unknown> };

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function getToken(): string | null {
  try { return localStorage.getItem("tg_jwt"); } catch { return null; }
}

// In-memory cache and single-flight promise to avoid duplicate auth calls
let tokenCache: string | null = null;
let tokenPromise: Promise<string | null> | null = null;

// Alternatively you can set at runtime in console: window.__TG_DEV_JWT = "<jwt>"
function getGlobalDevJwt(): string | null {
  try {
    const t = (window as any)?.__TG_DEV_JWT;
    return typeof t === "string" && t.length > 0 ? t : null;
  } catch { return null; }
}

function isLikelyJwt(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  if (token.length < 60) return false;
  const parts = token.split(".");
  return parts.length === 3 && parts.every(p => p.length > 0);
}

function setToken(token: string) {
  try { localStorage.setItem("tg_jwt", token); } catch {}
  tokenCache = token;
}

function getTelegramInitData(): string | null {
  // Try Telegram WebApp initData
  try {
    const g = (window as any)?.__TG_INIT_DATA;
    if (typeof g === "string" && g.length > 0) return g;
    const anyWindow = window as unknown as { Telegram?: { WebApp?: { initData?: string; ready?: () => void } } };
    try { anyWindow?.Telegram?.WebApp?.ready?.(); } catch {}
    const initData = anyWindow?.Telegram?.WebApp?.initData;
    if (initData && initData.length > 0) return initData;
  } catch {}
  // Try URL search params
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromSearch = qs.get("tgWebAppData") || qs.get("telegram_init_data");
    if (fromSearch && fromSearch.length > 0) return fromSearch;
  } catch {}
  // Try URL hash
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

async function ensureToken(): Promise<string | null> {
  if (isLikelyJwt(tokenCache)) return tokenCache;
  tokenCache = null;
  // 1) Dev override via window (do not persist to storage)
  const globalDev = getGlobalDevJwt();
  if (isLikelyJwt(globalDev)) { tokenCache = globalDev as string; return tokenCache; }
  // 2) Stored token
  const stored = getToken();
  if (isLikelyJwt(stored)) { tokenCache = stored as string; return tokenCache; }
  // Clear invalid stored token if present
  if (stored && !isLikelyJwt(stored)) { try { localStorage.removeItem("tg_jwt"); } catch {} }

  // Dev helpers: query string token or env token
  try {
    const qs = new URLSearchParams(window.location.search);
    const qToken = qs.get("jwt") || qs.get("token");
    if (isLikelyJwt(qToken)) { setToken(qToken!); tokenCache = qToken!; return qToken!; }
  } catch {}
  try {
    const envToken = (import.meta as any)?.env?.VITE_DEV_JWT as string | undefined;
    if (isLikelyJwt(envToken)) { setToken(envToken); tokenCache = envToken; return envToken; }
  } catch {}

  // Single-flight: if a token is already being fetched, await it
  if (tokenPromise) return tokenPromise;

  const initData = getTelegramInitData();
  if (!initData) return null;

  tokenPromise = (async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/auth/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ init_data: initData }),
      });
      if (!resp.ok) return null;
      const json = (await resp.json()) as AuthResponse;
      if (json?.access_token) {
        setToken(json.access_token);
        tokenCache = json.access_token;
        return json.access_token;
      }
      return null;
    } catch {
      return null;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Ensure we have a token before making any request (except the auth endpoint itself)
  if (!path.startsWith("/auth/telegram")) {
    await ensureToken();
  }
  let token = tokenCache || getToken();
  if (!isLikelyJwt(token)) token = null;
  // Block protected requests from being sent without a token
  const isPublic = path.startsWith("/auth/telegram") || path.startsWith("/health");
  if (!isPublic && !token) {
    throw new Error("Authentication required but token is missing");
  }
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    ...options,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Request failed with ${resp.status}`);
  }
  return (await resp.json()) as T;
}

export async function authWithTelegram(initData: string): Promise<AuthResponse> {
  const resp = await fetch(`${API_BASE_URL}/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ init_data: initData }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Request failed with ${resp.status}`);
  }
  const data = (await resp.json()) as AuthResponse;
  if (data?.access_token) setToken(data.access_token);
  return data;
}

export async function fetchMe(token: string): Promise<MeResponse> {
  return request<MeResponse>("/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Projects
export type Project = { id: number; name: string; color: string };
export async function getProjects(): Promise<Project[]> {
  return request<Project[]>("/projects/");
}
export async function getProjectsCached(opts: { revalidate?: boolean } = {}): Promise<Project[]> {
  const key = `cache:projects`;
  const cached = readCache<Project[]>(key);
  if (opts.revalidate !== false) {
    void (async () => {
      try {
        const fresh = await getProjects();
        if (!deepEqual(cached, fresh)) {
          writeCache(key, fresh);
          try { window.dispatchEvent(new CustomEvent("projects:changed", { detail: { type: "revalidated" } })); } catch {}
        } else {
          writeCache(key, fresh);
        }
      } catch {}
    })();
  }
  if (cached) return cached;
  const fresh = await getProjects();
  writeCache(key, fresh);
  return fresh;
}
export async function createProject(data: { name: string; color: string }): Promise<Project> {
  return request<Project>("/projects/", { method: "POST", body: JSON.stringify(data) });
}
export async function deleteProject(projectId: number): Promise<{ ok: boolean }> {
  return request(`/projects/${projectId}`, { method: "DELETE" });
}

// Tasks
export type Task = {
  id: number;
  title: string;
  description?: string;
  deadline?: string | null;
  duration_hours?: number;
  priority?: "low" | "medium" | "high";
  importance?: "low" | "medium" | "high";
  kind?: "task" | "event";
  event_start?: string | null;
  event_end?: string | null;
  project_id?: number | null;
};
export async function getTasks(params?: { project_id?: number; day?: string }): Promise<Task[]> {
  const q: string[] = [];
  if (params?.project_id != null) q.push(`project_id=${encodeURIComponent(String(params.project_id))}`);
  if (params?.day) q.push(`day=${encodeURIComponent(params.day)}`);
  const qs = q.length ? `?${q.join("&")}` : "";
  return request<Task[]>(`/tasks/${qs}`);
}
export async function getTasksCached(params?: { project_id?: number; day?: string }, opts: { revalidate?: boolean } = {}): Promise<Task[]> {
  const key = `cache:tasks:${params?.project_id ?? "_"}:${params?.day ?? "_"}`;
  const cached = readCache<Task[]>(key);
  if (opts.revalidate !== false) {
    void (async () => {
      try {
        const fresh = await getTasks(params);
        if (!deepEqual(cached, fresh)) {
          writeCache(key, fresh);
          try { window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "revalidated" } })); } catch {}
        } else {
          writeCache(key, fresh);
        }
      } catch {}
    })();
  }
  if (cached) return cached;
  const fresh = await getTasks(params);
  writeCache(key, fresh);
  return fresh;
}
export async function deleteTask(taskId: number): Promise<{ ok: boolean }> {
  return request(`/tasks/${taskId}`, { method: "DELETE" });
}
export async function createTask(data: Partial<Task>): Promise<Task> {
  return request<Task>("/tasks/", { method: "POST", body: JSON.stringify(data) });
}
export async function updateTask(taskId: number, data: Partial<Task>): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(data) });
}

// Events (stored as tasks with kind=event)
export async function getEvents(params?: { start?: string; end?: string }): Promise<Task[]> {
  const q: string[] = [];
  if (params?.start) q.push(`start=${encodeURIComponent(params.start)}`);
  if (params?.end) q.push(`end=${encodeURIComponent(params.end)}`);
  const qs = q.length ? `?${q.join("&")}` : "";
  return request<Task[]>(`/events/${qs}`);
}
export async function getEventsCached(params?: { start?: string; end?: string }, opts: { revalidate?: boolean } = {}): Promise<Task[]> {
  const key = `cache:events:${params?.start ?? "_"}:${params?.end ?? "_"}`;
  const cached = readCache<Task[]>(key);
  if (opts.revalidate !== false) {
    void (async () => {
      try {
        const fresh = await getEvents(params);
        if (!deepEqual(cached, fresh)) {
          writeCache(key, fresh);
          // No global event for events originally; reuse tasks:changed to trigger recalcs where needed
          try { window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "revalidated-events" } })); } catch {}
        } else {
          writeCache(key, fresh);
        }
      } catch {}
    })();
  }
  if (cached) return cached;
  const fresh = await getEvents(params);
  writeCache(key, fresh);
  return fresh;
}
export async function createEvent(data: Partial<Task>): Promise<Task> {
  const payload = { ...data, kind: "event" as const };
  return request<Task>("/events/", { method: "POST", body: JSON.stringify(payload) });
}

// Settings
export type UserSettings = {
  id: number;
  hours_mon: number; hours_tue: number; hours_wed: number; hours_thu: number; hours_fri: number; hours_sat: number; hours_sun: number;
};
export async function getMySettings(): Promise<UserSettings> {
  return request<UserSettings>("/settings/me");
}
export async function updateMySettings(data: Partial<UserSettings>): Promise<UserSettings> {
  return request<UserSettings>("/settings/me", { method: "PUT", body: JSON.stringify(data) });
}

export async function getMySettingsCached(opts: { revalidate?: boolean } = {}): Promise<UserSettings> {
  const key = `cache:settings:me`;
  const cached = readCache<UserSettings>(key);
  if (opts.revalidate !== false) {
    void (async () => {
      try {
        const fresh = await getMySettings();
        if (!deepEqual(cached, fresh)) {
          writeCache(key, fresh);
          try { window.dispatchEvent(new CustomEvent("tasks:changed", { detail: { type: "revalidated-settings" } })); } catch {}
        } else {
          writeCache(key, fresh);
        }
      } catch {}
    })();
  }
  if (cached) return cached;
  const fresh = await getMySettings();
  writeCache(key, fresh);
  return fresh;
}

// Simple localStorage cache helpers
function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch { return null; }
}
function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function deepEqual(a: unknown, b: unknown): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

