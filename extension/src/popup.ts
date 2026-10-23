import { clampPointerDwell } from '../../core';
import { GUIDE_URL } from '../../core/links';
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
  const h = status.harness;
  $('harness').textContent = t(h.connected ? 'popup.connected' : h.paired ? 'popup.offline' : 'popup.unpaired');
  $('engine').textContent = !h.connected
    ? t(h.paired ? 'popup.alone' : 'popup.pairHint')
    : h.engine !== 'local'
      ? t('popup.engine', { engine: h.label ?? h.engine, model: h.model ? ` (${h.model})` : '' })
      : t('popup.local');
  $('counts').textContent = t('popup.counts', { n: status.visits }) + (status.queued ? t('popup.queued', { n: status.queued }) : '');
}

function dwellLabel(ms: number): string {
  return t('popup.pointer.after', { s: (ms / 1000).toFixed(1) });
}

/** The exact command for this machine when the harness answers; the steps to get there when it does not. */
async function connectCommand(): Promise<string> {
  const { command } = await send<{ command: string | null }>({ type: 'connect-command' }).catch(() => ({ command: null }));
  return command ?? 'bun run harness\nbun run pair\nbun run setup';
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
  $('ledger').addEventListener('click', () => void send({ type: 'open-dashboard' }));
  $('mcp').addEventListener('click', async () => {
    const help = $('mcp-help');
    if (help.hidden) help.textContent = await connectCommand();
    help.hidden = !help.hidden;
  });
}

void main();
