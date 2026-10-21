// Typed calls to the harness API from the dashboard, which is served from the same origin.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: 'no-store', ...init });
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
