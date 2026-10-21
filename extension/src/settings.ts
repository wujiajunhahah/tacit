import { POINTER_DWELL_RANGE } from '../../core';
import type { LocalePref } from './i18n';

export interface Settings {
  version: number;
  paused: boolean;
  pausedDomains: string[];
  /** Never read these. An entry is a domain ("paypal.com") or a domain and path prefix ("x.com/messages"). */
  excludedDomains: string[];
  /** Count time under the pointer as close reading. */
  readWithPointer: boolean;
  pointerDwellMs: number;
  locale: LocalePref;
}

const SETTINGS_VERSION = 2;
/** Private by default: added to existing lists when settings are upgraded. */
const PRIVATE_BY_DEFAULT = ['mail.google.com', 'accounts.google.com', 'paypal.com', '1password.com', 'bitwarden.com', 'lastpass.com', 'x.com/messages', 'x.com/i/chat', 'twitter.com/messages'];

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  paused: false,
  pausedDomains: [],
  excludedDomains: PRIVATE_BY_DEFAULT,
  readWithPointer: false,
  pointerDwellMs: 1200,
  locale: 'auto',
};

const KEY = 'tacit:settings';

export function domainMatches(domain: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^\*\./, '');
  return p.length > 0 && (domain === p || domain.endsWith(`.${p}`));
}

/** "x.com/messages" matches x.com/messages/123 but not x.com/home. */
export function patternMatches(host: string, path: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^\*\./, '');
  if (!p) return false;
  const slash = p.indexOf('/');
  const domain = slash === -1 ? p : p.slice(0, slash);
  const prefix = slash === -1 ? '' : p.slice(slash).replace(/\/+$/, '');
  if (!domainMatches(host.replace(/^www\./, ''), domain)) return false;
  const lower = path.toLowerCase();
  return !prefix || lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}?`);
}

export function isActiveAt(host: string, path: string, s: Settings): boolean {
  if (s.paused) return false;
  return ![...s.pausedDomains, ...s.excludedDomains].some((p) => patternMatches(host, path, p));
}

export function isActiveOn(domain: string, s: Settings): boolean {
  return isActiveAt(domain, '/', s);
}

function normalize(raw: Partial<Settings> | undefined): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if ((raw?.version ?? 1) < SETTINGS_VERSION) {
    s.excludedDomains = [...new Set([...s.excludedDomains, ...PRIVATE_BY_DEFAULT])];
    s.version = SETTINGS_VERSION;
  }
  const [lo, hi] = POINTER_DWELL_RANGE;
  s.pointerDwellMs = Math.min(hi, Math.max(lo, Number(s.pointerDwellMs) || DEFAULT_SETTINGS.pointerDwellMs));
  return s;
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  const raw = r[KEY] as Partial<Settings> | undefined;
  const s = normalize(raw);
  if (raw && (raw.version ?? 1) < SETTINGS_VERSION) await saveSettings(s);
  return s;
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

export function onSettingsChanged(fn: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) fn(normalize(changes[KEY].newValue as Partial<Settings>));
  });
}

export const settingsForTest = { normalize, PRIVATE_BY_DEFAULT };
