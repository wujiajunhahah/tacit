// Trust between Tacit's parts on one machine. The harness holds a token only the user's account can read; a client
// first asks the harness to prove it holds that token, and only then sends it. Web Crypto, so the harness, the
// extension and the CLI share this code.

import type { HealthResponse } from './protocol';

const hex = (bytes: ArrayBuffer | Uint8Array) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A fresh challenge: 16 random bytes, as hex. */
export function newChallenge(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

/** HMAC-SHA256(token, challenge), as hex: the answer only a holder of the token can give. */
export async function harnessProof(token: string, challenge: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(challenge)));
}

/**
 * True when whatever listens at `origin` proves it holds `token`. The token itself is not sent, so a program that
 * took the port while the harness was down learns nothing.
 */
export async function provesToken(origin: string, token: string, timeoutMs = 800): Promise<boolean> {
  const challenge = newChallenge();
  try {
    const res = await fetch(`${origin}/v1/health?challenge=${challenge}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const { proof } = (await res.json()) as HealthResponse;
    return !!proof && proof === (await harnessProof(token, challenge));
  } catch {
    return false;
  }
}

export const authHeader = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });
