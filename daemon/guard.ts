// This daemon holds browsing history: only loopback Hosts and trusted Origins may talk to it.

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function isExtensionOrigin(origin: string | null): origin is string {
  return origin !== null && EXTENSION_ORIGIN.test(origin);
}

/** Blocks DNS rebinding: the Host must name the loopback address we listen on. */
export function hostAllowed(host: string | null, port: number): boolean {
  const h = host?.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/** No Origin (curl, agents), the extension, or the ledger UI itself. */
export function originAllowed(origin: string | null, port: number): boolean {
  if (origin === null) return true;
  return isExtensionOrigin(origin) || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/** CORS is granted to extension origins only, by reflection, never with `*`. */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isExtensionOrigin(origin)) return { Vary: 'Origin' };
  return {
    Vary: 'Origin',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  };
}
