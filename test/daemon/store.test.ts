import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Store } from '../../daemon/db';
import { currentContext, excerpt, search, trail } from '../../daemon/queries';
import { MIN, articlePage, pageEvent, removeHome, searchPage, simplePage, tempHome, visitTo } from './helpers';

let home: string;
let store: Store;

beforeEach(() => {
  home = tempHome();
  store = new Store({ home, maxVisits: 3 });
});

afterEach(() => {
  store.close();
  removeHome(home);
});

describe('Store', () => {
  test('a visit event replaces the stored visit', () => {
    const page = simplePage('https://a.example/', 'A', 'alpha');
    const v = visitTo(page);
    store.ingest([pageEvent(page, v)]);
    store.ingest([{ kind: 'visit', visit: { ...v, dwellMs: 42_000 } }]);
    expect(store.counts()).toEqual({ visits: 1, pages: 1 });
    expect(store.recentVisits(5)[0]?.dwellMs).toBe(42_000);
  });

  test('a visit that just ended does not take the current spot from an open one', () => {
    const a = simplePage('https://a.example/', 'A', 'alpha');
    const b = simplePage('https://b.example/', 'B', 'beta');
    const va = visitTo(a, { startedAt: Date.now() - 2 * MIN });
    const vb = visitTo(b, { startedAt: Date.now() - MIN });
    const t = Date.now();
    store.ingest([pageEvent(a, va)], t);
    store.ingest([pageEvent(b, vb)], t + 1);
    store.ingest([{ kind: 'visit', visit: { ...va, endedAt: t + 2 } }], t + 2);
    expect(store.currentVisit()?.id).toBe(vb.id);

    store.ingest([{ kind: 'visit', visit: { ...va, dwellMs: 9000 } }], t + 3);
    expect(store.currentVisit()?.id).toBe(va.id);
  });

  test('keeps only the newest visits and drops pages nothing points to', () => {
    const t = Date.now();
    for (let i = 0; i < 5; i++) {
      const page = simplePage(`https://p${i}.example/`, `Page ${i}`, `text ${i}`);
      store.ingest([pageEvent(page, visitTo(page, { startedAt: t - (5 - i) * MIN }))], t + i);
    }
    expect(store.counts()).toEqual({ visits: 3, pages: 3 });
    expect(store.page('https://p0.example/')).toBeNull();
    expect(store.page('https://p4.example/')?.title).toBe('Page 4');
  });
});

describe('queries', () => {
  test('an empty ledger has no context and no hits', () => {
    const ctx = currentContext(store);
    expect(ctx).toMatchObject({ visit: null, page: null, packet: null });
    expect(ctx.intent.source).toBe('none');
    expect(search(store, 'anything', 5)).toEqual([]);
    expect(trail(store, 5)).toEqual([]);
  });

  test('a title match outranks the same word in the body, and result pages are skipped', () => {
    const titled = simplePage('https://t.example/', 'Rate limits explained', 'How servers protect themselves from bursts.');
    const body = simplePage('https://b.example/', 'Server notes', 'Rate limits and more rate limits for every API.');
    const serp = searchPage('rate limits');
    store.ingest([pageEvent(titled, visitTo(titled)), pageEvent(body, visitTo(body)), pageEvent(serp, visitTo(serp))]);
    const hits = search(store, 'rate limits', 5);
    expect(hits.map((h) => h.url)).toEqual([titled.url, body.url]);
  });

  test('maxPassages caps the passages in the packet', () => {
    const page = articlePage();
    const v = visitTo(page, { statedIntent: { text: 'latency', at: Date.now() } });
    store.ingest([pageEvent(page, v)]);
    const one = currentContext(store, { maxPassages: 1 }).packet!;
    const more = currentContext(store, { maxPassages: 5 }).packet!;
    expect(one.tokens).toBeLessThan(more.tokens);
    expect(more.markdown).toContain('A reflex that answers in 300 milliseconds');
    expect(one.markdown).not.toContain('A reflex that answers in 300 milliseconds');
  });

  test('without a page model the context still names the visit', () => {
    const page = simplePage('https://a.example/', 'A', 'alpha');
    store.ingest([{ kind: 'visit', visit: visitTo(page) }]);
    const ctx = currentContext(store);
    expect(ctx.visit?.url).toBe(page.url);
    expect(ctx.page).toBeNull();
    expect(ctx.packet).toBeNull();
  });

  test('snippets are cut around the first match', () => {
    const text = `${'Filler words about nothing in particular. '.repeat(20)}The latency budget is 400 ms. ${'More filler. '.repeat(20)}`;
    const snippet = excerpt(text, ['latency'], 200);
    expect(snippet).toStartWith('…');
    expect(snippet).toContain('latency budget');
    expect(snippet.length).toBeLessThanOrEqual(202);
    expect(excerpt('short text', ['x'], 200)).toBe('short text');
  });
});
