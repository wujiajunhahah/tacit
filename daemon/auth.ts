// The harness's token: a secret in the ledger's folder that only the user's own account can read. Every API call
// but the health check carries it, so other accounts on the machine, which share 127.0.0.1, cannot read the ledger.

import { timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'token';
const SHAPE = /^[A-Za-z0-9_-]{43,}$/;

/** The token, created on first use (32 random bytes, base64url, a 0600 file). */
export function harnessToken(home: string): string {
  const existing = readToken(home);
  if (existing) return existing;
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const path = join(home, FILE);
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return token;
}

/** The token if the harness has made one; clients read it, never create it. */
export function readToken(home: string): string | null {
  const path = join(home, FILE);
  if (!existsSync(path)) return null;
  const token = readFileSync(path, 'utf8').trim();
  return SHAPE.test(token) ? token : null;
}

/** Whether a request carries this token, compared in constant time. */
export function carries(req: Request, token: string): boolean {
  const given = req.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
