export interface Settings {
  paused: boolean;
  pausedDomains: string[];
  /** Never read these sites. */
  excludedDomains: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  paused: false,
  pausedDomains: [],
  excludedDomains: ['mail.google.com', 'accounts.google.com', 'paypal.com', '1password.com', 'bitwarden.com', 'lastpass.com'],
};

const KEY = 'tacit:settings';

export function domainMatches(domain: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^\*\./, '');
  return p.length > 0 && (domain === p || domain.endsWith(`.${p}`));
}

export function isActiveOn(domain: string, s: Settings): boolean {
  if (s.paused) return false;
  return ![...s.pausedDomains, ...s.excludedDomains].some((p) => domainMatches(domain, p));
}

export async function loadSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((r[KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

export function onSettingsChanged(fn: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) fn({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
  });
}
