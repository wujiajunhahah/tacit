import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { Store } from '../../daemon/db';
import { search } from '../../daemon/queries';
import { MIN, pageEvent, removeHome, simplePage, tempHome, visitTo, zhPage } from './helpers';

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

const urls = (q: string) => search(store, q, 10).map((h) => h.url);

describe('full-text search', () => {
  test('reaches every page kept, not only the newest ones', () => {
    const now = Date.now();
    const old = simplePage('https://old.example/first', 'The first page', 'A rare word: zephyrine.');
    store.ingest([pageEvent(old, visitTo(old, { startedAt: now - 365 * 24 * 60 * MIN }))], now - 365 * 24 * 60 * MIN);
    const newer = Array.from({ length: 1200 }, (_, i) => simplePage(`https://new.example/${i}`, `Page ${i}`, `Ordinary words about routine ${i}.`));
    store.ingest(newer.map((p, i) => pageEvent(p, visitTo(p, { id: `v${i}`, startedAt: now - i * 1000 }))), now);
    expect(urls('zephyrine')).toEqual([old.url]);
  });

  test('finds a Chinese word inside a longer phrase', () => {
    const zh = zhPage();
    store.ingest([pageEvent(zh, visitTo(zh))]);
    expect(urls('毫秒')).toEqual([zh.url]);
    expect(urls('上下文')).toEqual([zh.url]);
  });

  test('ranks a match in the title above one in the body', () => {
    const inTitle = simplePage('https://a.example/', 'Decision latency', 'Something else entirely.');
    const inBody = simplePage('https://b.example/', 'A page', 'It mentions decision latency once, in passing, among other things.');
    store.ingest([pageEvent(inTitle, visitTo(inTitle)), pageEvent(inBody, visitTo(inBody, { id: 'b' }))]);
    expect(urls('decision latency')).toEqual([inTitle.url, inBody.url]);
  });

  test('a deleted page leaves the index', () => {
    const p = simplePage('https://gone.example/', 'Soon gone', 'Quixotic words.');
    store.ingest([pageEvent(p, visitTo(p))]);
    expect(urls('quixotic')).toEqual([p.url]);
    store.deletePage(p.url);
    expect(urls('quixotic')).toEqual([]);
    store.ingest([pageEvent(p, visitTo(p, { id: 'again', startedAt: Date.now() + 1000 }))], Date.now() + 1000);
    store.deleteAll();
    expect(urls('quixotic')).toEqual([]);
  });

  test('a ledger from before the index is indexed when it opens', () => {
    const p = simplePage('https://before.example/', 'Written before', 'Words from an older ledger: palimpsest.');
    store.ingest([pageEvent(p, visitTo(p))]);
    store.close();
    const raw = new Database(join(home, 'tacit.db'));
    raw.exec('DROP TABLE pages_fts; PRAGMA user_version = 0;');
    raw.close();
    store = new Store({ home });
    expect(urls('palimpsest')).toEqual([p.url]);
  });
});
