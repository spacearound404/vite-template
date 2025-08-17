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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
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
  return request<AuthResponse>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
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

