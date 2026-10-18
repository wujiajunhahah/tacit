import { HARNESS_ORIGIN } from '../../core';
import { send, type StatusReply } from './messages';
import { domainMatches, saveSettings, type Settings } from './settings';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function activeDomain(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tab?.url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const [status, domain] = await Promise.all([send<StatusReply>({ type: 'status' }), activeDomain()]);
  let settings: Settings = status.settings;

  $('dot').classList.toggle('on', status.harness.connected);
  $('harness').textContent = status.harness.connected ? 'Harness connected' : 'Harness offline';
  $('engine').textContent = status.harness.connected
    ? status.harness.engine === 'jev'
      ? `Decisions by Jev${status.harness.model ? ` (${status.harness.model})` : ''}`
      : 'Local reflex engine · set TYPESAFE_API_KEY for Jev'
    : 'The extension works alone; run the harness to share context with agents';
  $('counts').textContent = `${status.visits} visits in your trail${status.queued ? ` · ${status.queued} waiting to sync` : ''}`;

  const active = $<HTMLInputElement>('active');
  const siteActive = $<HTMLInputElement>('site-active');
  $('site').textContent = domain || 'this site';
  active.checked = !settings.paused;
  siteActive.checked = !settings.pausedDomains.some((p) => domainMatches(domain, p));
  siteActive.disabled = !domain;
  $<HTMLTextAreaElement>('excluded').value = settings.excludedDomains.join('\n');

  active.addEventListener('change', async () => {
    settings = { ...settings, paused: !active.checked };
    await saveSettings(settings);
  });
  siteActive.addEventListener('change', async () => {
    const others = settings.pausedDomains.filter((p) => !domainMatches(domain, p));
    settings = { ...settings, pausedDomains: siteActive.checked ? others : [...others, domain] };
    await saveSettings(settings);
  });
  $('save-excluded').addEventListener('click', async () => {
    const list = $<HTMLTextAreaElement>('excluded')
      .value.split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    settings = { ...settings, excludedDomains: [...new Set(list)] };
    await saveSettings(settings);
    $('save-excluded').textContent = 'Saved';
  });
  $('ledger').addEventListener('click', () => void chrome.tabs.create({ url: `${HARNESS_ORIGIN}/` }));
  $('mcp').addEventListener('click', () => ($('mcp-help').hidden = !$('mcp-help').hidden));
}

void main();
