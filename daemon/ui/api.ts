// Typed calls to the harness API from the dashboard, which is served from the same origin. Every call carries the
// harness's token, which this browser keeps after `bun run pair` or the popup's "Open dashboard".

const TOKEN_KEY = 'tacit.token';

/** Takes a token handed over in the URL fragment (never sent to a server), keeps it, and clears the address bar. */
export function adoptToken(): void {
  const m = location.hash.match(/^#token=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  localStorage.setItem(TOKEN_KEY, m[1]!);
  history.replaceState(null, '', location.pathname);
}

const token = () => localStorage.getItem(TOKEN_KEY) ?? '';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token()}` };
  const res = await fetch(path, { cache: 'no-store', ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new HttpError(res.status, body?.error ?? `${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

export const get = <T>(path: string): Promise<T> => request<T>(path);

export const del = <T>(path: string, headers: Record<string, string> = {}): Promise<T> =>
  request<T>(path, { method: 'DELETE', headers });

export function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
