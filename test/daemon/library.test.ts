import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { PageModel, Read } from '../../core';
import { Store, forgetKeySync } from '../../daemon/db';
import { formatPage } from '../../daemon/format';
import { pageDetail, pages } from '../../daemon/library';
import { MIN, articlePage, ledgerEntry, pageEvent, removeHome, searchPage, simplePage, tempHome, visitTo, zhPage } from './helpers';

const read = (page: PageModel, needle: string, ms: number, via: Read['via'], at = Date.now()): Read => {
  const block = page.blocks.find((b) => b.text.includes(needle));
  if (!block) throw new Error(`no block with “${needle}”`);
  return { blockId: block.id, text: block.text, ms, via, at };
};

const browse = { q: '', site: '', limit: 30, offset: 0 };

let home: string;
let store: Store;

beforeEach(() => {
  home = tempHome();
  store = new Store({ home });
});

afterEach(() => {
  store.close();
  removeHome(home);
});

/** An article read twice, a Chinese page, a quick look at another site and a search page. */
function seed() {
  const now = Date.now();
  const article = articlePage();
  const zh = zhPage();
  const glance = simplePage('https://news.example/item', 'A quick glance', 'Something unrelated, read for a moment.');
  const serp = searchPage('decision latency');
  // One batch with one receive time, as when the extension flushes a backlog: order must come from the visits.
  store.ingest([
    pageEvent(zh, visitTo(zh, { startedAt: now - 3 * 24 * 60 * MIN, endedAt: now - 3 * 24 * 60 * MIN + 5 * MIN, dwellMs: 5 * MIN, reads: [read(zh, '四百毫秒', 6000, 'view')] })),
    pageEvent(glance, visitTo(glance, { startedAt: now - 10 * MIN, endedAt: now - 9 * MIN, dwellMs: 50_000 })),
    pageEvent(serp, visitTo(serp, { startedAt: now - 8 * MIN, endedAt: now - 7 * MIN, dwellMs: 4000, searchQuery: 'decision latency' })),
    pageEvent(
      article,
      visitTo(article, { startedAt: now - 2 * 60 * MIN, endedAt: now - 2 * 60 * MIN + 2 * MIN, dwellMs: 2 * MIN, reads: [read(article, 'Below roughly 400', 5000, 'view')] }),
    ),
    pageEvent(
      article,
      visitTo(article, {
        startedAt: now - 6 * MIN,
        dwellMs: 4 * MIN,
        arrival: { kind: 'search', searchQuery: 'decision latency', fromTitle: serp.title, viaLabel: article.title },
        selections: [{ text: 'Below roughly 400 milliseconds people stop waiting', at: now - 2 * MIN }],
        reads: [read(article, 'Below roughly 400', 12_000, 'pointer'), read(article, 'A reflex that answers', 4000, 'view'), read(article, 'Every interface we use', 2000, 'view')],
      }),
    ),
    { kind: 'ledger', entry: ledgerEntry({ id: 'j1', url: article.url }) },
    { kind: 'ledger', entry: ledgerEntry({ id: 'j2', url: glance.url }) },
  ]);
  return { article, zh, glance, serp };
}

describe('library', () => {
  test('each page carries what the user gave it', () => {
    const { article } = seed();
    const row = pages(store, browse).pages.find((p) => p.url === article.url)!;
    expect(row).toMatchObject({ visits: 2, dwellMs: 6 * MIN, readMs: 23_000, reads: 3, selections: 1, copies: 0 });
  });

  test('recent follows when the user read, not when the harness heard about it', () => {
    seed();
    expect(pages(store, browse).pages.map((p) => p.domain)).toEqual(['example.com', 'google.com', 'news.example', 'zh.example.com']);
  });

  test('most read puts the passages that held attention first', () => {
    seed();
    expect(pages(store, { ...browse, sort: 'attention' }).pages.map((p) => p.domain)).toEqual([
      'example.com',
      'zh.example.com',
      'news.example',
      'google.com',
    ]);
  });

  test('filters by site and paginates with a total', () => {
    seed();
    expect(pages(store, { ...browse, site: 'zh.example.com' }).pages.map((p) => p.title)).toEqual(['上下文才是新的交互界面']);
    const first = pages(store, { ...browse, limit: 2 });
    const second = pages(store, { ...browse, limit: 2, offset: 2 });
    expect(first.total).toBe(4);
    expect([...first.pages, ...second.pages].map((p) => p.url)).toEqual(pages(store, browse).pages.map((p) => p.url));
  });

  test('searches read pages in English and Chinese, best match first, with a snippet', () => {
    const { article, zh } = seed();
    const en = pages(store, { ...browse, q: 'decision latency' });
    expect(en.pages.map((p) => p.url)).toEqual([article.url]);
    expect(en.pages[0]?.snippet).toContain('latency');
    const cn = pages(store, { ...browse, q: '决策延迟' });
    expect(cn.pages.map((p) => p.url)).toEqual([zh.url]);
    expect(cn.pages[0]?.snippet).toContain('四百毫秒');
    expect(pages(store, { ...browse, q: 'xylophone zeppelin' })).toMatchObject({ pages: [], total: 0 });
  });
});

describe('page detail', () => {
  test('passages read closely are summed across visits, in page order', () => {
    const { article } = seed();
    const d = pageDetail(store, article.url)!;
    const order = new Map(article.blocks.map((b, i) => [b.id, i]));
    expect(d.reads.map((r) => order.get(r.blockId))).toEqual([...d.reads.map((r) => order.get(r.blockId))].sort((a, b) => a! - b!));
    const latency = d.reads.find((r) => r.text.includes('Below roughly 400'))!;
    expect(latency).toMatchObject({ ms: 17_000, via: 'pointer' });
  });

  test('carries the intent from that page’s own visits, a packet and only its actions', () => {
    const { article } = seed();
    const d = pageDetail(store, article.url)!;
    expect(d.intent.source).toBe('inferred');
    expect(d.packet.markdown).toContain('# Context: Context is the new interface');
    expect(d.packet.markdown).toContain('searched “decision latency”');
    expect(d.actions.map((a) => a.id)).toEqual(['j1']);
    expect(d.visits).toHaveLength(2);
    expect(pageDetail(store, 'https://nowhere.example/')).toBeNull();
  });

  test('agents see the passages the user lingered on', () => {
    const { article } = seed();
    const text = formatPage({ page: store.page(article.url)!, visits: store.visitsFor(article.url, 10) }, 20_000);
    expect(text).toContain('## Read closely');
    expect(text).toContain('Below roughly 400 milliseconds people stop waiting');
  });
});

describe('forgetting', () => {
  test('deleting a page removes its visits and what Tacit did there, nothing else', () => {
    const { article, glance } = seed();
    expect(store.deletePage(article.url)).toEqual({ pages: 1, visits: 2, actions: 1 });
    expect(store.page(article.url)).toBeNull();
    expect(store.ledgerFor(glance.url, 5)).toHaveLength(1);
    expect(store.counts()).toEqual({ pages: 3, visits: 3 });
  });

  test('a deleted page stays deleted: a stale copy is refused, a new visit is kept', () => {
    const { article } = seed();
    const at = Date.now();
    store.deletePage(article.url, at);
    const stale = visitTo(article, { id: 'stale', startedAt: at - MIN });
    const fresh = visitTo(article, { id: 'fresh', startedAt: at + 1000 });
    expect(store.ingest([pageEvent(article, stale), { kind: 'ledger', entry: ledgerEntry({ id: 'old', url: article.url, at: at - MIN }) }])).toBe(0);
    // Proposed before the delete, dismissed after it: still the deleted page's history.
    expect(store.ingest([{ kind: 'ledger', entry: ledgerEntry({ id: 'late', url: article.url, createdAt: at - MIN, at: at + 1000, state: 'dismissed' }) }])).toBe(0);
    expect(store.ingest([pageEvent(article, fresh)])).toBe(1);
    expect(store.visitsFor(article.url, 5).map((v) => v.id)).toEqual(['fresh']);
  });

  test('deleting everything refuses anything older, and survives a restart', () => {
    const { glance } = seed();
    const at = Date.now();
    store.deleteAll(at);
    store.close();
    store = new Store({ home });
    expect(store.ingest([pageEvent(glance, visitTo(glance, { startedAt: at - MIN }))])).toBe(0);
    expect(store.ingest([pageEvent(glance, visitTo(glance, { startedAt: at + 1000 }))])).toBe(1);
  });

  test('tombstones name pages by hash, never by address', () => {
    const { article, glance } = seed();
    store.deletePage(article.url, 1000);
    store.deletePage(glance.url, 2000);
    expect(store.forgetAt()).toBe(2000);
    expect(store.forgottenSince(1000)).toEqual({ at: 2000, all: undefined, pages: [{ key: forgetKeySync(glance.url), at: 2000 }] });
    expect(JSON.stringify(store.forgottenSince(0))).not.toContain('example');
    store.deleteAll(3000);
    expect(store.forgottenSince(2000)).toEqual({ at: 3000, all: 3000, pages: [] });
  });

  test('deleting everything empties the ledger', () => {
    seed();
    expect(store.deleteAll()).toEqual({ pages: 4, visits: 5, actions: 2 });
    expect(store.stats()).toMatchObject({ pages: 0, visits: 0, actions: 0, readMs: 0, since: null, sites: [] });
  });

  test('stats count pages, sites and attention', () => {
    seed();
    const s = store.stats();
    expect(s).toMatchObject({ pages: 4, visits: 5, actions: 2, readMs: 29_000 });
    expect(s.sites.map((x) => x.domain).sort()).toEqual(['example.com', 'google.com', 'news.example', 'zh.example.com']);
    expect(s.storage.path).toEndWith('tacit.db');
    expect(s.storage.bytes).toBeGreaterThan(0);
  });
});
