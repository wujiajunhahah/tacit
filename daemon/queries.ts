// The read side of the harness, shared by the HTTP server and the MCP server.

import {
  NO_INTENT,
  buildPacket,
  clip,
  describeArrival,
  inferIntent,
  isHop,
  rankBlocks,
  siteTerms,
  tokenize,
  type Block,
  type CurrentContextResponse,
  type Intent,
  type LedgerEntry,
  type PageResponse,
  type Ranked,
  type SearchHit,
  type TrailItem,
  type Visit,
} from '../core';
import type { Store } from './db';

/** Visits the intent is inferred from, current one included. */
const INTENT_TRAIL = 30;
const SNIPPET_CHARS = 200;
const PAGE_VISITS = 20;

export interface ContextOptions {
  maxPassages?: number;
}

/** The current visit and the visits before it, oldest first. */
function recent(store: Store): { current: Visit | null; earlier: Visit[] } {
  const current = store.currentVisit((v) => !isHop(v));
  if (!current) return { current: null, earlier: [] };
  const earlier = store
    .recentVisits(INTENT_TRAIL)
    .filter((v) => v.id !== current.id)
    .slice(0, INTENT_TRAIL - 1)
    .reverse();
  return { current, earlier };
}

function intentOf(current: Visit, earlier: Visit[]): Intent {
  return inferIntent([...earlier, current], { currentTitle: current.title });
}

export function currentContext(store: Store, opts: ContextOptions = {}): CurrentContextResponse {
  const { current, earlier } = recent(store);
  if (!current) return { visit: null, page: null, intent: NO_INTENT, packet: null };
  const page = store.page(current.url);
  const intent = intentOf(current, earlier);
  const packet = page
    ? buildPacket({
        page,
        intent,
        visit: current,
        trail: earlier,
        ranked: rankBlocks(page.blocks, intent, siteTerms(page.domain, page.title)),
        maxPassages: opts.maxPassages,
      })
    : null;
  return { visit: current, page, intent, packet, activeAt: store.activeAt(current.id) };
}

export function intent(store: Store): Intent {
  const { current, earlier } = recent(store);
  return current ? intentOf(current, earlier) : NO_INTENT;
}

/** Newest first, each with a sentence on how the user arrived. */
export function trail(store: Store, limit: number): TrailItem[] {
  return store
    .recentVisits(limit * 2)
    .filter((v) => !isHop(v))
    .slice(0, limit)
    .map((visit) => ({ visit, arrival: describeArrival(visit) }));
}

export function page(store: Store, url: string): PageResponse | null {
  const model = store.page(url);
  return model ? { page: model, visits: store.visitsFor(url, PAGE_VISITS) } : null;
}

export function ledger(store: Store, limit: number): LedgerEntry[] {
  return store.ledger(limit);
}

/** BM25 over the pages the user has read; titles count three times. */
export function search(store: Store, query: string, limit: number): SearchHit[] {
  const tokens = [...new Set(tokenize(query))];
  const terms = Object.fromEntries(tokens.map((t) => [t, 1]));
  return store.searchPages(tokens, limit).map((p) => ({
    url: p.url,
    title: p.title,
    domain: p.domain,
    snippet: snippetFor(store, p.url, terms),
    score: p.score,
    lastSeen: p.lastSeen,
  }));
}

/** The best-matching body block (a heading only if nothing else matches), cut around the first match. */
function snippetFor(store: Store, url: string, terms: Record<string, number>): string {
  const model = store.page(url);
  if (!model) return '';
  const matches = rankBlocks(model.blocks, { ...NO_INTENT, terms }).filter((r) => r.score > 0);
  const best = (pool: Ranked<Block>[]) => pool.reduce<Ranked<Block> | undefined>((a, r) => (a && a.score >= r.score ? a : r), undefined);
  const pick = best(matches.filter((r) => r.item.kind !== 'heading')) ?? best(matches);
  const text = pick?.item.text || model.description || model.blocks.find((b) => b.kind !== 'heading')?.text || '';
  return excerpt(text, Object.keys(terms), SNIPPET_CHARS);
}

export function excerpt(text: string, terms: string[], max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const lower = flat.toLowerCase();
  const hits = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const first = hits.length ? Math.min(...hits) : 0;
  if (first < max * 0.6) return clip(flat, max);
  let start = first - Math.floor(max / 3);
  const space = flat.indexOf(' ', start);
  if (space !== -1 && space - start < 20) start = space + 1;
  return `…${clip(flat.slice(start), max)}`;
}
