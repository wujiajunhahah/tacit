// The context library: every recorded page as an asset, with what the user gave it.

import {
  NO_INTENT,
  buildPacket,
  inferIntent,
  rankBlocks,
  siteTerms,
  type Block,
  type Intent,
  type PageDetailResponse,
  type PagesResponse,
  type ReadPassage,
  type Visit,
} from '../core';
import type { Store } from './db';
import { search } from './queries';
import type { PagesQuery } from './schemas';

/** Search ranks at most this many pages before filters and pagination. */
const SEARCH_POOL = 200;
const DETAIL_VISITS = 50;
const DETAIL_ACTIONS = 50;

export function pages(store: Store, query: PagesQuery): PagesResponse {
  const { q, site, limit, offset } = query;
  const sort = query.sort === 'attention' ? 'attention' : 'recent';
  if (!q.trim()) return { ...store.pageSummaries({ site, sort, limit, offset }), offset, limit };

  const hits = search(store, q, SEARCH_POOL);
  if (hits.length === 0) return { pages: [], total: 0, offset, limit };
  const rank = new Map(hits.map((h, i) => [h.url, { i, snippet: h.snippet }]));
  const found = store.pageSummaries({ site, sort, urls: [...rank.keys()], limit: hits.length, offset: 0 }).pages;
  // Searching ranks by match unless the user asked for another order.
  const ordered = query.sort === 'recent' || query.sort === 'attention' ? found : found.sort((a, b) => rank.get(a.url)!.i - rank.get(b.url)!.i);
  return {
    pages: ordered.slice(offset, offset + limit).map((p) => ({ ...p, snippet: rank.get(p.url)?.snippet })),
    total: ordered.length,
    offset,
    limit,
  };
}

export function pageDetail(store: Store, url: string): PageDetailResponse | null {
  const page = store.page(url);
  const summary = store.pageSummaries({ sort: 'recent', urls: [url], limit: 1, offset: 0 }).pages[0];
  if (!page || !summary) return null;
  const visits = store.visitsFor(url, DETAIL_VISITS);
  const intent = pageIntent(visits, page.title);
  return {
    page,
    visits,
    summary,
    reads: readPassages(visits, page.blocks),
    intent,
    packet: buildPacket({ page, intent, visit: visits[0], ranked: rankBlocks(page.blocks, intent, siteTerms(page.domain, page.title)) }),
    actions: store.ledgerFor(url, DETAIL_ACTIONS),
  };
}

/** What the user seemed to be after on this page, judged at their last moment there. */
function pageIntent(visits: Visit[], title: string): Intent {
  if (visits.length === 0) return NO_INTENT;
  return inferIntent([...visits].reverse(), { now: lastMoment(visits), currentTitle: title });
}

function lastMoment(visits: Visit[]): number {
  let t = 0;
  for (const v of visits) {
    t = Math.max(t, v.startedAt + v.dwellMs, v.endedAt ?? 0);
    for (const m of [...v.selections, ...v.copies, ...v.clicks, ...(v.reads ?? [])]) t = Math.max(t, m.at);
  }
  return t;
}

/** Passages read closely, summed over visits, in page order. */
export function readPassages(visits: Visit[], blocks: Block[]): ReadPassage[] {
  const order = new Map(blocks.map((b, i) => [b.id, i]));
  const byBlock = new Map<string, ReadPassage>();
  for (const v of visits) {
    for (const r of v.reads ?? []) {
      const prev = byBlock.get(r.blockId);
      byBlock.set(
        r.blockId,
        prev
          ? {
              ...prev,
              ms: prev.ms + r.ms,
              via: prev.via === 'pointer' || r.via === 'pointer' ? 'pointer' : 'view',
              at: Math.max(prev.at, r.at),
            }
          : { blockId: r.blockId, text: r.text, ms: r.ms, via: r.via, at: r.at },
      );
    }
  }
  const pos = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...byBlock.values()].sort((a, b) => pos(a.blockId) - pos(b.blockId) || b.ms - a.ms);
}
