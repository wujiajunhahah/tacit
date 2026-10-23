// Model provider keys: one 0600 file in the ledger's folder, never in the repository, never printed. An environment
// variable of the same provider wins over the file, so a key can live only in a shell or a secret manager.

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from './db';

export const KEYS_FILE = 'keys.json';

/** Environment variables that hold a provider's key, by provider name. */
export const KEY_ENV: Record<string, string> = { typesafe: 'TYPESAFE_API_KEY', openrouter: 'OPENROUTER_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };

export type Keys = Record<string, string>;

function read(home: string): Keys {
  const path = join(home, KEYS_FILE);
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0));
  } catch {
    return {};
  }
}

/** Every key the harness can use, the environment first. */
export function loadKeys(home: string, env: Env = process.env): Keys {
  const keys = read(home);
  for (const [name, variable] of Object.entries(KEY_ENV)) {
    const value = env[variable]?.trim();
    if (value) keys[name] = value;
  }
  return keys;
}

/** Where each key comes from, without the key: for `bun run keys list` and the dashboard. */
export function keySources(home: string, env: Env = process.env): Record<string, 'file' | 'env'> {
  const out: Record<string, 'file' | 'env'> = {};
  for (const name of Object.keys(read(home))) out[name] = 'file';
  for (const [name, variable] of Object.entries(KEY_ENV)) if (env[variable]?.trim()) out[name] = 'env';
  return out;
}

export function saveKey(home: string, name: string, value: string | null): void {
  const keys = read(home);
  if (value) keys[name] = value;
  else delete keys[name];
  const path = join(home, KEYS_FILE);
  writeFileSync(path, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/** "sk-or-v1-…c439f": enough to recognize a key, not enough to use it. */
export function hint(value: string): string {
  return value.length <= 12 ? '…' : `${value.slice(0, 6)}…${value.slice(-4)}`;
}
