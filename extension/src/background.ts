// Service worker: the in-browser half of the harness. Keeps the trail, works out how each page
// was reached, and syncs with the local harness when it is running.

import {
  HARNESS_ORIGIN,
  LocalEngine,
  domainOf,
  inferIntent,
  sameDocument,
  searchQueryOf,
  type Arrival,
  type DecisionRequest,
  type DecisionResponse,
  type HealthResponse,
  type IngestEvent,
  type LedgerEntry,
  type PageModel,
  type Visit,
} from '../../core';
import type { DecideReply, HarnessStatus, IntentReply, PendingClick, StatusReply, ToBackground, ToContent, VisitPatch, VisitStartReply } from './messages';
import { loadSettings } from './settings';

interface Nav {
  url: string;
  transition: string;
  qualifiers: string[];
  at: number;
}

interface TabState {
  visitId?: string;
  pendingClick?: PendingClick;
  nav?: Nav;
  /** URL before any redirect, so a search that redirects straight to a result still counts. */
  requested?: { url: string; at: number };
  openerTabId?: number;
}

const TRAIL_KEY = 'tacit:trail';
const LEDGER_KEY = 'tacit:ledger';
const TABS_KEY = 'tacit:tabs';
const MAX_TRAIL = 300;
const MAX_LEDGER = 200;
const MAX_QUEUE = 500;

const state = { loaded: false, trail: [] as Visit[], ledger: [] as LedgerEntry[], tabs: {} as Record<string, TabState> };
const pages = new Map<string, PageModel>();
const acked = new Set<string>();
const queue: IngestEvent[] = [];
const localEngine = new LocalEngine();
let loading: Promise<void> | null = null;
let health: { at: number; status: HarnessStatus } | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

function load(): Promise<void> {
  if (state.loaded) return Promise.resolve();
  loading ??= (async () => {
    const [l, s] = await Promise.all([chrome.storage.local.get([TRAIL_KEY, LEDGER_KEY]), chrome.storage.session.get(TABS_KEY)]);
    state.trail = (l[TRAIL_KEY] as Visit[] | undefined) ?? [];
    state.ledger = (l[LEDGER_KEY] as LedgerEntry[] | undefined) ?? [];
    state.tabs = (s[TABS_KEY] as Record<string, TabState> | undefined) ?? {};
    state.loaded = true;
  })();
  return loading;
}

function save(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void chrome.storage.local.set({ [TRAIL_KEY]: state.trail, [LEDGER_KEY]: state.ledger });
    void chrome.storage.session.set({ [TABS_KEY]: state.tabs });
  }, 300);
}

function tab(id: number): TabState {
  return (state.tabs[String(id)] ??= {});
}

function findVisit(id: string | undefined): Visit | undefined {
  if (!id) return undefined;
  for (let i = state.trail.length - 1; i >= 0; i--) if (state.trail[i]!.id === id) return state.trail[i];
  return undefined;
}

export function computeArrival(a: {
  url: string;
  referrer: string;
  nav?: Nav;
  requested?: { url: string; at: number };
  prev?: Visit;
  click?: PendingClick;
  newTab: boolean;
  now?: number;
}): Arrival {
  const now = a.now ?? Date.now();
  const nav = a.nav && sameDocument(a.nav.url, a.url) && now - a.nav.at < 60_000 ? a.nav : undefined;
  const qualifiers = nav?.qualifiers ?? [];
  if (qualifiers.includes('forward_back')) return { kind: 'back_forward', fromUrl: a.prev?.url, fromTitle: a.prev?.title };
  if (nav?.transition === 'reload') return { kind: 'reload' };
  const redirected = qualifiers.includes('server_redirect') || qualifiers.includes('client_redirect');
  const requestedQuery = redirected && a.requested && now - a.requested.at < 60_000 ? searchQueryOf(a.requested.url) : undefined;
  if (requestedQuery) return { kind: 'search', fromUrl: a.requested!.url, searchQuery: requestedQuery };
  if (nav && ['typed', 'generated', 'keyword'].includes(nav.transition)) return { kind: 'typed' };
  if (nav?.transition === 'auto_bookmark') return { kind: 'bookmark' };

  const fromUrl = a.prev?.url ?? (a.referrer || undefined);
  const click = a.click && (sameDocument(a.click.href, a.url) || now - a.click.at < 15_000) ? a.click : undefined;
  const searchQuery = searchQueryOf(fromUrl) ?? (a.prev?.arrival.kind === 'search' && a.prev.domain === domainOf(a.url) ? a.prev.arrival.searchQuery : undefined);
  const base = { fromUrl, fromTitle: a.prev?.title, viaLabel: click?.label, searchQuery };
  if (click?.viaTacit) return { kind: 'tacit', ...base };
  if (a.newTab && !searchQueryOf(fromUrl)) return { kind: 'new_tab', ...base };
  if (searchQueryOf(fromUrl) && fromUrl && !sameDocument(fromUrl, a.url)) return { kind: 'search', ...base };
  if (fromUrl) return { kind: 'link', ...base };
  return { kind: 'unknown' };
}

function intentFor(visit: Visit | undefined) {
  return inferIntent(state.trail.slice(-30), { currentTitle: visit?.title });
}

function slim(v: Visit): Visit {
  return { ...v, selections: v.selections.slice(-2), copies: v.copies.slice(-2), clicks: v.clicks.slice(-3) };
}

function keyOf(ev: IngestEvent): string {
  return ev.kind === 'ledger' ? `l:${ev.entry.id}` : `v:${ev.visit.id}`;
}

function enqueue(ev: IngestEvent): void {
  const key = keyOf(ev);
  const i = queue.findIndex((q) => keyOf(q) === key);
  if (i >= 0) {
    const old = queue[i]!;
    queue[i] = old.kind === 'page' && ev.kind === 'visit' ? { kind: 'page', page: old.page, visit: ev.visit } : ev;
  } else {
    queue.push(ev);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  }
  scheduleFlush();
}

function scheduleFlush(delay = 800): void {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), delay);
}

async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  if (!(await harnessStatus()).connected) return;
  flushing = true;
  try {
    while (queue.length) {
      const batch = queue.splice(0, 40);
      let ok = false;
      try {
        const res = await fetch(`${HARNESS_ORIGIN}/v1/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }),
          signal: AbortSignal.timeout(4000),
        });
        ok = res.ok;
      } catch {
        health = null;
      }
      if (!ok) {
        const queued = new Set(queue.map(keyOf));
        queue.unshift(...batch.filter((ev) => !queued.has(keyOf(ev))));
        break;
      }
      for (const ev of batch) if (ev.kind === 'page') acked.add(ev.visit.id);
    }
  } finally {
    flushing = false;
  }
}

async function harnessStatus(force = false): Promise<HarnessStatus> {
  if (!force && health && Date.now() - health.at < 15_000) return health.status;
  let status: HarnessStatus = { connected: false, engine: 'local' };
  try {
    const res = await fetch(`${HARNESS_ORIGIN}/v1/health`, { signal: AbortSignal.timeout(700) });
    if (res.ok) {
      const j = (await res.json()) as HealthResponse;
      status = { connected: true, engine: j.engine, model: j.model };
    }
  } catch {
    // Harness not running; the extension works on its own.
  }
  health = { at: Date.now(), status };
  if (status.connected && queue.length) scheduleFlush(50);
  return status;
}

async function decide(req: DecisionRequest): Promise<DecisionResponse> {
  if ((await harnessStatus()).connected) {
    try {
      const res = await fetch(`${HARNESS_ORIGIN}/v1/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return (await res.json()) as DecisionResponse;
    } catch {
      health = null;
    }
  }
  return localEngine.decide(req);
}

async function startVisit(msg: Extract<ToBackground, { type: 'visit:start' }>, tabId: number): Promise<VisitStartReply> {
  const t = tab(tabId);
  const sameTab = findVisit(t.visitId);
  const opener = t.openerTabId != null ? state.tabs[String(t.openerTabId)] : undefined;
  const newTab = !sameTab && !!opener;
  const prev = sameTab ?? findVisit(opener?.visitId);
  const click = sameTab ? t.pendingClick : opener?.pendingClick;
  if (sameTab && !sameTab.endedAt) {
    sameTab.endedAt = msg.startedAt;
    enqueue({ kind: 'visit', visit: sameTab });
  }
  const visit: Visit = {
    id: msg.visitId,
    url: msg.url,
    title: msg.title,
    domain: domainOf(msg.url),
    tabId,
    startedAt: msg.startedAt,
    dwellMs: 0,
    maxScroll: 0,
    arrival: computeArrival({ url: msg.url, referrer: msg.referrer, nav: t.nav, requested: t.requested, prev, click, newTab }),
    searchQuery: searchQueryOf(msg.url),
    selections: [],
    copies: [],
    clicks: [],
  };
  state.trail.push(visit);
  if (state.trail.length > MAX_TRAIL) state.trail.splice(0, state.trail.length - MAX_TRAIL);
  t.visitId = visit.id;
  t.pendingClick = undefined;
  t.nav = undefined;
  t.requested = undefined;
  pages.set(visit.id, msg.page);
  if (pages.size > 30) pages.delete(pages.keys().next().value!);
  enqueue({ kind: 'page', page: msg.page, visit });
  save();
  const earlier = state.trail.filter((v) => v.id !== visit.id);
  return {
    visit,
    intent: intentFor(visit),
    trailTail: earlier.slice(-5).map(slim),
    visitedUrls: [...new Set(earlier.map((v) => v.url))].slice(-300),
    harness: await harnessStatus(),
  };
}

function updateVisit(id: string, patch: VisitPatch): IntentReply {
  const v = findVisit(id);
  if (!v) return { intent: intentFor(undefined) };
  for (const [k, value] of Object.entries(patch)) if (value !== undefined) (v as unknown as Record<string, unknown>)[k] = value;
  const page = pages.get(id);
  enqueue(page && !acked.has(id) ? { kind: 'page', page, visit: v } : { kind: 'visit', visit: v });
  save();
  return { intent: intentFor(v), visit: v };
}

function stateIntent(id: string, text: string): IntentReply {
  const v = findVisit(id);
  if (v) {
    v.statedIntent = { text, at: Date.now() };
    enqueue({ kind: 'visit', visit: v });
    save();
  }
  return { intent: intentFor(v), visit: v };
}

function upsertLedger(entry: LedgerEntry): void {
  const i = state.ledger.findIndex((e) => e.id === entry.id);
  if (i >= 0) state.ledger[i] = entry;
  else state.ledger.push(entry);
  if (state.ledger.length > MAX_LEDGER) state.ledger.splice(0, state.ledger.length - MAX_LEDGER);
  enqueue({ kind: 'ledger', entry });
  save();
}

async function handle(msg: ToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id ?? -1;
  switch (msg.type) {
    case 'visit:start':
      return startVisit(msg, tabId);
    case 'visit:update':
      return updateVisit(msg.visitId, msg.patch);
    case 'page:update': {
      pages.set(msg.visitId, msg.page);
      acked.delete(msg.visitId);
      const v = findVisit(msg.visitId);
      if (v) enqueue({ kind: 'page', page: msg.page, visit: v });
      return { ok: true };
    }
    case 'click':
      tab(tabId).pendingClick = msg.click;
      save();
      return { ok: true };
    case 'intent:state':
      return stateIntent(msg.visitId, msg.text);
    case 'decide':
      return { response: await decide(msg.request) } satisfies DecideReply;
    case 'ledger':
      upsertLedger(msg.entry);
      return { ok: true };
    case 'status': {
      const [settings, harness] = await Promise.all([loadSettings(), harnessStatus(true)]);
      return { harness, settings, visits: state.trail.length, queued: queue.length, currentTitle: state.trail.at(-1)?.title } satisfies StatusReply;
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
    load()
      .then(() => handle(msg, sender))
      .then(sendResponse, (err: unknown) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
    return true;
  });

  chrome.webNavigation.onBeforeNavigate.addListener((d) => {
    if (d.frameId !== 0) return;
    void load().then(() => {
      tab(d.tabId).requested = { url: d.url, at: Date.now() };
    });
  });

  chrome.webNavigation.onCommitted.addListener((d) => {
    if (d.frameId !== 0) return;
    void load().then(() => {
      tab(d.tabId).nav = { url: d.url, transition: d.transitionType, qualifiers: d.transitionQualifiers, at: Date.now() };
      save();
    });
  });

  chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
    if (d.frameId !== 0) return;
    void load().then(() => {
      tab(d.tabId).nav = { url: d.url, transition: 'link', qualifiers: d.transitionQualifiers ?? [], at: Date.now() };
      save();
      chrome.tabs.sendMessage(d.tabId, { type: 'tacit:navigated', url: d.url } satisfies ToContent).catch(() => undefined);
    });
  });

  chrome.tabs.onCreated.addListener((t) => {
    if (t.id == null || t.openerTabId == null) return;
    const id = t.id;
    const opener = t.openerTabId;
    void load().then(() => {
      tab(id).openerTabId = opener;
      save();
    });
  });

  chrome.tabs.onRemoved.addListener((id) => {
    void load().then(() => {
      const v = findVisit(state.tabs[String(id)]?.visitId);
      if (v && !v.endedAt) {
        v.endedAt = Date.now();
        enqueue({ kind: 'visit', visit: v });
      }
      delete state.tabs[String(id)];
      save();
    });
  });

  void load().then(() => harnessStatus());
}
