// Ledger UI client, bundled into GET / by ui/index.ts. Polls the harness JSON API and renders it.

import {
  STATE_LABEL,
  ago,
  clip,
  describeEvidence,
  type CurrentContextResponse,
  type HealthResponse,
  type LedgerEntry,
  type Packet,
  type SearchHit,
  type TrailItem,
  type Visit,
} from '../../core';
import { duration, pct, plural } from '../units';

const REFRESH_MS = 5000;
const THREAD_GAP_MS = 10 * 60_000;

type Child = Node | string | false | null | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const c of children) if (c) node.append(c);
  return node;
}

function link(url: string, text: string, cls: string): HTMLElement {
  if (!/^https?:\/\//i.test(url)) return el('span', cls, text);
  const a = el('a', cls, text);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  return a;
}

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing`);
  return node;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

function day(ts: number): string {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

let packet: Packet | null = null;

async function copyPacket(note: HTMLElement): Promise<void> {
  if (!packet) return;
  try {
    await navigator.clipboard.writeText(packet.markdown);
    note.textContent = 'Copied. Paste it into your agent.';
  } catch {
    note.textContent = 'The browser blocked the clipboard.';
  }
  setTimeout(() => (note.textContent = ''), 2500);
}

function now(ctx: CurrentContextResponse, arrival: string): Node[] {
  const { intent, visit } = ctx;
  const out: Node[] = [];
  if (intent.source === 'none' || !intent.text) {
    out.push(el('p', 'intent is-quiet', 'No clear goal yet'));
  } else {
    const fill = el('i');
    fill.style.width = pct(intent.confidence);
    out.push(
      el('p', 'intent', intent.text),
      el('p', 'confidence', el('span', 'meter', fill), el('span', 'mono', `${intent.source} · ${pct(intent.confidence)}`)),
    );
    const t = Date.now();
    const evidence = intent.evidence.slice(0, 4).map((ev) => {
      const sentence = describeEvidence(ev, t);
      const cut = sentence.lastIndexOf(' · ');
      return el('li', '', sentence.slice(0, cut), el('span', 'when mono', sentence.slice(cut + 3)));
    });
    if (evidence.length) out.push(el('ul', 'evidence', ...evidence));
    const others = intent.candidates.slice(1, 3).filter((c) => c.p >= 0.05);
    if (others.length) out.push(el('p', 'others', `Or perhaps: ${others.map((c) => `${clip(c.text, 48)} (${pct(c.p)})`).join(' · ')}`));
  }
  if (visit) {
    out.push(
      el(
        'div',
        'reading',
        el('div', 'kicker', 'Reading'),
        link(visit.url, visit.title || visit.url, 'reading-title'),
        el('p', 'reading-meta', [visit.domain, arrival].filter(Boolean).join(' · ')),
      ),
    );
  }
  if (ctx.packet) {
    const note = el('span', 'note');
    note.setAttribute('aria-live', 'polite');
    const button = el('button', '', 'Copy context for your agent');
    button.type = 'button';
    button.addEventListener('click', () => void copyPacket(note));
    const cost = `~${ctx.packet.tokens} tokens · ${pct(ctx.packet.saved)} saved vs. the whole page`;
    out.push(el('div', 'handoff', button, el('span', 'cost mono', cost), note));
  }
  return out;
}

/** Newest-first visits split wherever nothing happened for ten minutes. */
function threads(items: TrailItem[]): TrailItem[][] {
  const groups: TrailItem[][] = [];
  let newer: Visit | undefined;
  for (const item of items) {
    const v = item.visit;
    const lastActive = v.endedAt ?? v.startedAt + v.dwellMs;
    if (!newer || newer.startedAt - lastActive > THREAD_GAP_MS) groups.push([]);
    groups[groups.length - 1]?.push(item);
    newer = v;
  }
  return groups;
}

function visitRow(item: TrailItem, current: boolean): HTMLElement {
  const v = item.visit;
  const meta = [
    v.dwellMs >= 1000 ? `read ${duration(v.dwellMs)}` : '',
    v.maxScroll >= 0.05 ? `scrolled ${pct(v.maxScroll)}` : '',
    v.copies.length ? plural(v.copies.length, 'copy', 'copies') : '',
  ].filter(Boolean);
  return el(
    'li',
    current ? 'visit is-current' : 'visit',
    el('time', 'mono', current ? 'now' : clock(v.startedAt)),
    el(
      'div',
      '',
      el('div', 'v-head', link(v.url, v.title || v.url, 'v-title'), el('span', 'v-domain', v.domain)),
      item.arrival && el('p', 'v-arrival', item.arrival),
      meta.length > 0 && el('p', 'v-meta mono', meta.join(' · ')),
      ...v.selections.slice(-2).map((s) => el('blockquote', '', clip(s.text, 240))),
    ),
  );
}

function thread(items: TrailItem[], currentId: string | undefined): HTMLElement {
  const oldest = items[items.length - 1]!.visit;
  const newest = items[0]!.visit;
  const span = oldest === newest ? clock(oldest.startedAt) : `${clock(oldest.startedAt)}–${clock(newest.startedAt)}`;
  return el(
    'div',
    'thread',
    el('div', 'thread-head mono', el('span', '', `${day(oldest.startedAt)} · ${span}`), el('span', '', plural(items.length, 'page', 'pages'))),
    el('ol', 'visits', ...items.map((t) => visitRow(t, t.visit.id === currentId))),
  );
}

function entry(e: LedgerEntry): HTMLElement {
  const detail = el('div', 'e-reason', e.reason);
  if (e.confidence !== undefined) detail.append(' · ', el('span', 'mono', pct(e.confidence)));
  if (e.engine) detail.append(` · ${e.engine}`);
  return el(
    'li',
    `state-${e.state}`,
    el('div', 'e-head', el('span', 'e-state', STATE_LABEL[e.state]), el('time', 'mono', clock(e.at))),
    el('div', 'e-label', e.label),
    detail,
  );
}

function hit(h: SearchHit): HTMLElement {
  return el(
    'li',
    '',
    link(h.url, h.title || h.url, 'r-title'),
    el('div', 'r-meta mono', `${h.domain} · ${ago(Date.now() - h.lastSeen)}`),
    h.snippet && el('p', 'r-snip', h.snippet),
  );
}

let lastKey = '';

function render(health: HealthResponse, ctx: CurrentContextResponse, trail: TrailItem[], ledger: LedgerEntry[]): void {
  const status = byId('status');
  status.classList.remove('is-off');
  const engine = health.engine === 'jev' ? `Jev ${health.model ?? ''}`.trim() : 'local engine';
  status.textContent = [engine, plural(health.visits, 'visit', 'visits'), plural(health.pages, 'page', 'pages')].join(' · ');
  byId('colophon').textContent =
    health.engine === 'jev'
      ? 'Your ledger stays on this machine. Only decision questions go to TypeSafe’s Jev, because a TypeSafe key is set.'
      : 'Your ledger stays on this machine. Nothing is sent anywhere.';

  const empty = health.visits === 0;
  byId('empty').hidden = !empty;
  byId('grid').hidden = empty;
  if (empty) return;

  packet = ctx.packet;
  const currentId = ctx.visit?.id;
  const arrival = trail.find((t) => t.visit.id === currentId)?.arrival ?? '';
  byId('now').replaceChildren(...now(ctx, arrival));
  byId('trail').replaceChildren(...threads(trail).map((t) => thread(t, currentId)));
  byId('ledger').replaceChildren(
    ...(ledger.length ? ledger.map(entry) : [el('li', 'quiet', 'Nothing yet. What Tacit suggests or does for you is recorded here.')]),
  );
}

async function refresh(): Promise<void> {
  try {
    const [health, ctx, trail, ledger] = await Promise.all([
      get<HealthResponse>('/v1/health'),
      get<CurrentContextResponse>('/v1/context/current'),
      get<TrailItem[]>('/v1/trail?limit=60'),
      get<LedgerEntry[]>('/v1/ledger?limit=40'),
    ]);
    // Re-render only when something changed, or every half minute so relative times stay true.
    const key = JSON.stringify([health, ctx.visit, ctx.intent.text, ctx.packet?.tokens, trail, ledger, Math.floor(Date.now() / 30_000)]);
    if (key === lastKey) return;
    lastKey = key;
    render(health, ctx, trail, ledger);
  } catch {
    lastKey = '';
    const status = byId('status');
    status.textContent = 'harness unreachable · start it with “bun run harness”';
    status.classList.add('is-off');
  }
}

let searchSeq = 0;

async function search(query: string): Promise<void> {
  const seq = ++searchSeq;
  const count = byId('count');
  const results = byId('results');
  if (!query.trim()) {
    count.textContent = '';
    results.replaceChildren();
    return;
  }
  try {
    const hits = await get<SearchHit[]>(`/v1/search?q=${encodeURIComponent(query)}&limit=12`);
    if (seq !== searchSeq) return;
    count.textContent = hits.length ? plural(hits.length, 'page', 'pages') : 'Nothing you have read matches that.';
    results.replaceChildren(...hits.map(hit));
  } catch {
    if (seq === searchSeq) count.textContent = 'Search failed. Is the harness running?';
  }
}

const input = byId('q') as HTMLInputElement;
let pending: ReturnType<typeof setTimeout> | undefined;
input.addEventListener('input', () => {
  clearTimeout(pending);
  pending = setTimeout(() => void search(input.value), 200);
});

void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
