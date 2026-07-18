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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  me: () => req<{ user: { username: string } }>('/me'),
  login: (username: string, password: string) =>
    req<{ user: { username: string } }>('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: true }>('/logout', { method: 'POST' }),
  portals: () => req<{ portals: Portal[] }>('/portals'),
  togglePortal: (id: string, enabled: boolean) =>
    req<{ portal: Portal }>(`/portals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  testPortal: (id: string) => req<TestResult>(`/portals/${id}/test`, { method: 'POST' }),
  jobs: () => req<{ jobs: NotifiedJob[] }>('/jobs?limit=200'),
};
