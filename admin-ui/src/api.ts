export interface Portal {
  id: string;
  name: string;
  source: string;
  company: string | null;
  enabled: boolean;
  status: string;
  intervalSeconds: number;
  lastRunAt: string | null;
  failureCount: number;
}

export interface TestJob {
  title: string;
  url: string;
  location: string | null;
  company: string | null;
  description: string | null;
}

export interface TestResult {
  ok: boolean;
  portal: string;
  source: string;
  durationMs: number;
  count?: number;
  jobs?: TestJob[];
  error?: string;
}

export interface NotifiedJob {
  id: string;
  title: string;
  url: string;
  company: string | null;
  location: string | null;
  portal: string | null;
  score: number | null;
  reasoning: string | null;
  tags: string[];
  createdAt: string;
}

// Base URL of the admin API. Empty in dev (Vite proxies /api to :4000) and when
// the API serves this build itself; set VITE_API_BASE to the Render URL when the
// frontend is hosted elsewhere (e.g. Firebase).
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'hugin_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null); // stale/expired token → force re-login
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  me: () => req<{ user: { username: string } }>('/me'),
  login: async (username: string, password: string) => {
    const r = await req<{ token: string; user: { username: string } }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(r.token);
    return r;
  },
  logout: async () => {
    setToken(null);
    return { ok: true as const };
  },
  portals: () => req<{ portals: Portal[] }>('/portals'),
  togglePortal: (id: string, enabled: boolean) =>
    req<{ portal: Portal }>(`/portals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  testPortal: (id: string) => req<TestResult>(`/portals/${id}/test`, { method: 'POST' }),
  jobs: () => req<{ jobs: NotifiedJob[] }>('/jobs?limit=200'),
};
