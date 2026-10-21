// This daemon holds browsing history: only loopback Hosts and trusted Origins may talk to it.

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/** DELETE /v1/all must carry this header with this value, so nothing wipes the ledger by accident. */
export const CONFIRM_HEADER = 'x-tacit-confirm';
export const CONFIRM_DELETE_ALL = 'delete-everything';

export function isExtensionOrigin(origin: string | null): origin is string {
  return origin !== null && EXTENSION_ORIGIN.test(origin);
}

function isOwnOrigin(origin: string | null, port: number): boolean {
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/** Blocks DNS rebinding: the Host must name the loopback address we listen on. */
export function hostAllowed(host: string | null, port: number): boolean {
  const h = host?.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

/** No Origin (curl, agents), the extension, or the dashboard itself. */
export function originAllowed(origin: string | null, port: number): boolean {
  return origin === null || isExtensionOrigin(origin) || isOwnOrigin(origin, port);
}

/** Deleting is for the dashboard or a local script, never for an extension. */
export function deleteAllowed(origin: string | null, port: number): boolean {
  return origin === null || isOwnOrigin(origin, port);
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
