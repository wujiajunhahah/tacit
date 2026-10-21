// The dashboard: a hash router over seven views, bundled into GET / by ui/index.ts.

import type { HealthResponse } from '../../core';
import { get } from './api';
import { el } from './dom';
import { getLocale, initLocale, setLocale, t, tn, type Key } from './i18n';
import type { App, View } from './view';
import * as connect from './views/connect';
import * as learned from './views/learned';
import * as library from './views/library';
import * as now from './views/now';
import * as page from './views/page';
import * as privacy from './views/privacy';
import * as trail from './views/trail';

const REFRESH_MS = 5000;
const VIEWS = { now, library, page, trail, learned, connect, privacy } satisfies Record<string, View>;
type Name = keyof typeof VIEWS;
const NAV: Name[] = ['now', 'library', 'trail', 'learned', 'connect', 'privacy'];

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing`);
  return node as T;
}

const view = byId('view');
const app: App = { health: null, libraryHash: '#/library', refreshStatus };

function parse(): { name: Name; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const cut = raw.indexOf('?');
  const path = cut === -1 ? raw : raw.slice(0, cut);
  const name = (path in VIEWS ? path : 'now') as Name;
  return { name, params: new URLSearchParams(cut === -1 ? '' : raw.slice(cut + 1)) };
}

function drawChrome(): void {
  document.documentElement.lang = getLocale();
  byId('skip').textContent = t('skip');
  byId('brand-sub').textContent = t('brand.sub');
  const nav = byId('nav');
  nav.setAttribute('aria-label', t('nav.label'));
  byId('nav-links').replaceChildren(
    ...NAV.map((name) => {
      const a = el('a', '', t(`nav.${name}` as Key));
      a.href = `#/${name}`;
      a.dataset.view = name;
      return el('li', '', a);
    }),
  );
  const lang = byId<HTMLButtonElement>('lang');
  lang.textContent = t('lang.switch');
  lang.setAttribute('aria-label', t('lang.label'));
  drawStatus();
  markNav();
}

function markNav(): void {
  const current = parse().name;
  const active = current === 'page' ? 'library' : current;
  for (const a of byId('nav-links').querySelectorAll('a')) {
    if (a.dataset.view === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function drawStatus(): void {
  const status = byId('status');
  const h = app.health;
  status.classList.toggle('is-off', !h);
  status.textContent = h
    ? [h.engine === 'jev' ? t('status.jev', { model: h.model ?? '' }).trim() : t('status.local'), tn('status.pages', h.pages)].join(' · ')
    : t('status.offline');
  byId('colophon').textContent = h?.engine === 'jev' ? t('colophon.jev') : t('colophon.local');
}

async function refreshStatus(): Promise<void> {
  try {
    app.health = await get<HealthResponse>('/v1/health');
  } catch {
    app.health = null;
  }
  drawStatus();
}

let seq = 0;
let lastKey = '';
let focusSearch = false;

async function show(opts: { focus: boolean; polling?: boolean }): Promise<void> {
  const { name, params } = parse();
  const mine = ++seq;
  markNav();
  try {
    const out = await VIEWS[name].render(params, app);
    if (mine !== seq) return;
    if (opts.polling && out.key !== undefined && out.key === lastKey) return;
    lastKey = out.key ?? '';
    view.replaceChildren(out.node);
  } catch {
    if (mine === seq) view.replaceChildren(el('p', 'error', t('common.error')));
    return;
  }
  if (focusSearch && name === 'library') {
    focusSearch = false;
    document.getElementById('q')?.focus();
  } else if (opts.focus) {
    window.scrollTo(0, 0);
    (view.querySelector<HTMLElement>('h1') ?? view).focus({ preventScroll: true });
  }
}

/** Polls must not pull the page out from under someone using the keyboard inside it. */
function busyInView(): boolean {
  const active = document.activeElement;
  return !!active && active !== view && view.contains(active) && active.tagName !== 'H1';
}

window.addEventListener('hashchange', () => void show({ focus: true }));

byId('lang').addEventListener('click', () => {
  setLocale(getLocale() === 'en' ? 'zh-CN' : 'en');
  drawChrome();
  void show({ focus: false });
});

document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]')) return;
  e.preventDefault();
  if (parse().name === 'library') document.getElementById('q')?.focus();
  else {
    focusSearch = true;
    location.hash = '#/library';
  }
});

setInterval(() => {
  if (document.hidden) return;
  void refreshStatus();
  const current: View = VIEWS[parse().name];
  if (current.poll && !busyInView()) void show({ focus: false, polling: true });
}, REFRESH_MS);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refreshStatus();
});

initLocale();
drawChrome();
void refreshStatus().then(() => show({ focus: false }));
