// Small display helpers shared by the ledger UI and the MCP text output.

import { homedir } from 'node:os';
import { sep } from 'node:path';

/** The home folder as ~, for paths shown to the user. */
export function tilde(path: string, home = homedir()): string {
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}
