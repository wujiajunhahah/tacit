import { GUIDE_URL, HARNESS_ORIGIN, clampPointerDwell } from '../../core';
import { detectLocale, getLocale, setLocale, t, type Key, type LocalePref } from './i18n';
import { send, type StatusReply } from './messages';
import { patternMatches, saveSettings, type Settings } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The site in the active tab; none for new-tab, settings and extension pages, which Tacit never reads. */
async function activeTab(): Promise<{ host: string; path: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const u = new URL(tab?.url ?? '');
    if (!/^https?:$/.test(u.protocol)) throw new Error('not a web page');
    return { host: u.hostname.replace(/^www\./, ''), path: u.pathname };
  } catch {
    return { host: '', path: '/' };
  }
}

function translate(status: StatusReply, site: string): void {
  document.documentElement.lang = getLocale();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n as Key)));
  $('guide').setAttribute('href', GUIDE_URL[getLocale()]);
  $('site').textContent = t('popup.site', { site });
  $('harness').textContent = t(status.harness.connected ? 'popup.connected' : 'popup.offline');
  $('engine').textContent = !status.harness.connected
    ? t('popup.alone')
    : status.harness.engine === 'jev'
      ? t('popup.jev', { model: status.harness.model ? ` (${status.harness.model})` : '' })
      : t('popup.local');
  $('counts').textContent = t('popup.counts', { n: status.visits }) + (status.queued ? t('popup.queued', { n: status.queued }) : '');
}

function dwellLabel(ms: number): string {
  return t('popup.pointer.after', { s: (ms / 1000).toFixed(1) });
}

async function connectCommand(): Promise<string> {
  try {
    const res = await fetch(`${HARNESS_ORIGIN}/v1/connect`, { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      const j = (await res.json()) as { command?: string };
      if (j.command) return j.command;
    }
  } catch {
    // Harness not running, or an older one without /v1/connect.
  }
  return 'bun run harness\nclaude mcp add --scope user tacit -- bun /path/to/tacit/daemon/mcp.ts';
}

async function main(): Promise<void> {
  const [status, tab] = await Promise.all([send<StatusReply>({ type: 'status' }), activeTab()]);
  let settings: Settings = status.settings;
  const save = async (next: Settings) => {
    settings = next;
    await saveSettings(next);
  };
  setLocale(detectLocale(settings.locale));
  translate(status, tab.host);

  $('dot').classList.toggle('on', status.harness.connected);
  const active = $<HTMLInputElement>('active');
  const siteActive = $<HTMLInputElement>('site-active');
  const pointer = $<HTMLInputElement>('pointer');
  const dwell = $<HTMLInputElement>('dwell');
  const locale = $<HTMLSelectElement>('locale');

  active.checked = !settings.paused;
  siteActive.checked = !settings.pausedDomains.some((p) => patternMatches(tab.host, tab.path, p));
  $('site-row').hidden = !tab.host;
  pointer.checked = settings.readWithPointer;
  dwell.value = String(settings.pointerDwellMs);
  $('dwell-row').hidden = !settings.readWithPointer;
  $('dwell-label').textContent = dwellLabel(settings.pointerDwellMs);
  locale.value = settings.locale;
  $<HTMLTextAreaElement>('excluded').value = settings.excludedDomains.join('\n');

  active.addEventListener('change', () => void save({ ...settings, paused: !active.checked }));
  siteActive.addEventListener('change', () => {
    const others = settings.pausedDomains.filter((p) => !patternMatches(tab.host, '/', p));
    void save({ ...settings, pausedDomains: siteActive.checked ? others : [...others, tab.host] });
  });
  pointer.addEventListener('change', () => {
    $('dwell-row').hidden = !pointer.checked;
    void save({ ...settings, readWithPointer: pointer.checked });
  });
  dwell.addEventListener('input', () => ($('dwell-label').textContent = dwellLabel(Number(dwell.value))));
  dwell.addEventListener('change', () => void save({ ...settings, pointerDwellMs: clampPointerDwell(Number(dwell.value)) }));
  locale.addEventListener('change', () => {
    const pref = locale.value as LocalePref;
    setLocale(detectLocale(pref));
    translate(status, tab.host);
    $('dwell-label').textContent = dwellLabel(Number(dwell.value));
    void save({ ...settings, locale: pref });
  });
  $('save-excluded').addEventListener('click', async () => {
    const list = $<HTMLTextAreaElement>('excluded')
      .value.split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await save({ ...settings, excludedDomains: [...new Set(list)] });
    $('save-excluded').textContent = t('popup.saved');
  });
  $('ledger').addEventListener('click', () => void chrome.tabs.create({ url: `${HARNESS_ORIGIN}/` }));
  $('mcp').addEventListener('click', async () => {
    const help = $('mcp-help');
    if (help.hidden) help.textContent = await connectCommand();
    help.hidden = !help.hidden;
  });
}

void main();
