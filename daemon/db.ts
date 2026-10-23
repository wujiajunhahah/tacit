// The local ledger: pages, visits and harness actions in one SQLite file under $TACIT_HOME.

import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { tokenize, type DeleteResponse, type ForgottenResponse, type IngestEvent, type LedgerEntry, type PageModel, type PageSummary, type StatsResponse, type TacitEvent, type Visit } from '../core';
import { tilde } from './units';

export type Env = Record<string, string | undefined>;

export const MAX_VISITS = 20_000;
/** Deleted pages remembered, so a stale copy of their history cannot bring them back. */
const MAX_FORGOTTEN = 1000;
/** The tombstone that stands for "everything". */
const ALL = '*';
/** Events kept for replay; followers that fall further behind start again from now. */
const MAX_EVENTS = 10_000;

type EventBody = TacitEvent extends infer E ? (E extends unknown ? Omit<E, 'id' | 'at'> : never) : never;

/** What a follower learns from an ingested item: enough to act on, without the page text or the trail. */
function eventOf(ev: IngestEvent): EventBody[] {
  if (ev.kind === 'ledger') {
    const { id, kind, state, label, url } = ev.entry;
    return [{ kind: 'action', action: { id, kind, state, label, url } }];
  }
  const v = ev.visit;
  const visit: EventBody = {
    kind: 'visit',
    visit: {
      id: v.id,
      url: v.url,
      title: v.title,
      startedAt: v.startedAt,
      endedAt: v.endedAt,
      arrival: v.arrival.kind,
      searchQuery: v.arrival.searchQuery,
      stated: v.statedIntent?.text,
      dwellMs: v.dwellMs,
      reads: v.reads?.length ?? 0,
      selections: v.selections.length,
    },
  };
  if (ev.kind === 'visit') return [visit];
  return [{ kind: 'page', page: { url: ev.page.url, title: ev.page.title, kind: ev.page.kind, blocks: ev.page.blocks.length } }, visit];
}

/** Same as core's forgetKey, synchronously: the hash a deleted page is remembered by. */
export function forgetKeySync(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export function tacitHome(env: Env = process.env): string {
  return env.TACIT_HOME || join(homedir(), '.tacit');
}

/** A full-text hit: the page, how well it matched (higher is better), and when it was last seen. */
export interface PageHit {
  url: string;
  title: string;
  domain: string;
  lastSeen: number;
  score: number;
}

/** Title weighs more than the body, as a reader skims titles first. */
const TITLE_WEIGHT = 3;
/** The index holds Tacit's own tokens, so Chinese words and English stems match the way intent does. */
const tokens = (s: string) => tokenize(s).join(' ');

export interface StoreOptions {
  home?: string;
  maxVisits?: number;
  /**
   * Read, and change nothing on disk: for the command line, which agents such as Codex run in a sandbox that may not
   * write to the ledger's folder. The ledger must already exist at the current schema; the harness makes both.
   */
  readonly?: boolean;
}

const SCHEMA_VERSION = 2;

/**
 * A reader that may not write cannot create the files WAL mode reads through, and SQLite removes them when the last
 * writer closes. So with the harness stopped, the ledger opens as an immutable file, which it then is.
 */
function openReadonly(path: string): Database {
  const db = new Database(path, { readonly: true, strict: true });
  try {
    // SQLite opens on first use, so only a query tells.
    db.query('PRAGMA schema_version').get();
    return db;
  } catch {
    db.close();
    return new Database(`file:${path.replace(/[%?#]/g, encodeURIComponent)}?immutable=1`, { readonly: true, strict: true });
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  url TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  kind TEXT NOT NULL,
  model_json TEXT NOT NULL,
  text TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pages_last_seen ON pages (last_seen);
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visits_started ON visits (started_at);
CREATE INDEX IF NOT EXISTS visits_updated ON visits (updated_at);
CREATE INDEX IF NOT EXISTS visits_url ON visits (url);
CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_at ON ledger (at);
CREATE TABLE IF NOT EXISTS forgotten (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);
`;

type JsonRow = { data_json: string };

export type DeletedCounts = DeleteResponse['deleted'];

export interface SummaryQuery {
  site?: string;
  sort: 'recent' | 'attention';
  limit: number;
  offset: number;
  /** Only these pages. */
  urls?: string[];
}

// A page with no text and no title of its own (a redirect on the way somewhere) is not one you read.
const SUMMARY_WHERE = `($site = '' OR p.domain = $site) AND ($urls IS NULL OR p.url IN (SELECT value FROM json_each($urls)))
  AND (p.text != '' OR p.title != p.url)`;

const SUMMARY_SELECT = `
WITH v AS (
  SELECT url, COUNT(*) AS visits, MIN(started_at) AS first_visit,
    MAX(COALESCE(json_extract(data_json, '$.endedAt'), started_at + COALESCE(json_extract(data_json, '$.dwellMs'), 0))) AS last_active,
    SUM(COALESCE(json_extract(data_json, '$.dwellMs'), 0)) AS dwell_ms,
    SUM(COALESCE(json_array_length(data_json, '$.selections'), 0)) AS selections,
    SUM(COALESCE(json_array_length(data_json, '$.copies'), 0)) AS copies
  FROM visits GROUP BY url
), r AS (
  SELECT visits.url AS url, SUM(json_extract(je.value, '$.ms')) AS read_ms,
    COUNT(DISTINCT json_extract(je.value, '$.blockId')) AS reads
  FROM visits, json_each(visits.data_json, '$.reads') AS je GROUP BY visits.url
)
SELECT p.url, p.title, p.domain, p.kind,
  COALESCE(v.first_visit, p.first_seen) AS firstSeen, COALESCE(v.last_active, p.last_seen) AS lastSeen,
  COALESCE(v.visits, 0) AS visits, COALESCE(v.dwell_ms, 0) AS dwellMs,
  COALESCE(r.read_ms, 0) AS readMs, COALESCE(r.reads, 0) AS reads,
  COALESCE(v.selections, 0) AS selections, COALESCE(v.copies, 0) AS copies
FROM pages p LEFT JOIN v ON v.url = p.url LEFT JOIN r ON r.url = p.url
WHERE ${SUMMARY_WHERE}`;

const SUMMARY_ORDER: Record<SummaryQuery['sort'], string> = {
  recent: 'lastSeen DESC, p.url',
  attention: 'readMs DESC, dwellMs DESC, lastSeen DESC, p.url',
};

export class Store {
  readonly path: string;
  private readonly db: Database;
  private readonly maxVisits: number;
  /** Tombstones: page key (or ALL) → when it was deleted. */
  private forgotten = new Map<string, number>();
  private readonly followers = new Set<(e: TacitEvent) => void>();

  constructor(opts: StoreOptions = {}) {
    const home = opts.home ?? tacitHome();
    this.path = join(home, 'tacit.db');
    this.maxVisits = opts.maxVisits ?? MAX_VISITS;
    if (opts.readonly) {
      this.db = openReadonly(this.path);
      this.db.exec('PRAGMA busy_timeout = 3000;');
      if (this.version() < SCHEMA_VERSION) throw new Error(`${tilde(this.path)} is from an older Tacit. Start the harness once to update it: bun run harness`);
    } else {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      this.db = new Database(this.path, { create: true, strict: true });
      chmodSync(this.path, 0o600);
      this.db.exec(
        'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = ON;',
      );
      this.db.exec(SCHEMA);
      this.migrate();
    }
    this.loadForgotten();
  }

  private version(): number {
    return this.db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
  }

  /** Schema changes past the base tables, in order, recorded in user_version. */
  private migrate(): void {
    const version = this.version();
    if (version < 1) {
      this.db.transaction(() => {
        // Contentless: the text already lives in `pages`; the index keeps only what it needs to find it.
        this.db.exec(
          "CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(title, domain, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')",
        );
        const rows = this.db.query<{ rowid: number; title: string; domain: string; text: string }, []>('SELECT rowid, title, domain, text FROM pages').all();
        for (const r of rows) this.indexPage(r.rowid, r.title, r.domain, r.text);
        this.db.exec('PRAGMA user_version = 1');
      })();
    }
    if (version < 2) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, data_json TEXT NOT NULL);
        PRAGMA user_version = 2;`);
    }
  }

  /** Follow what happens from now on; returns how to stop. */
  follow(fn: (e: TacitEvent) => void): () => void {
    this.followers.add(fn);
    return () => this.followers.delete(fn);
  }

  /** Events after `since`, oldest first. */
  eventsSince(since: number, limit: number): TacitEvent[] {
    return this.db
      .query<{ id: number; at: number; data_json: string }, [number, number]>('SELECT id, at, data_json FROM events WHERE id > ? ORDER BY id LIMIT ?')
      .all(since, limit)
      .map((r) => ({ id: r.id, at: r.at, ...JSON.parse(r.data_json) }) as TacitEvent);
  }

  lastEventId(): number {
    return this.db.query<{ id: number | null }, []>('SELECT MAX(id) AS id FROM events').get()!.id ?? 0;
  }

  /** Written inside the caller's transaction; followers hear of them once it commits. */
  private record(bodies: EventBody[], at: number, out: TacitEvent[]): void {
    for (const body of bodies) {
      const { lastInsertRowid } = this.db.query('INSERT INTO events (at, data_json) VALUES (?, ?)').run(at, JSON.stringify(body));
      out.push({ id: Number(lastInsertRowid), at, ...body } as TacitEvent);
    }
  }

  private announce(events: TacitEvent[]): void {
    for (const e of events) for (const fn of this.followers) fn(e);
  }

  private count(sql: string, ...params: string[]): number {
    return this.db.query<{ n: number }, string[]>(sql).get(...params)!.n;
  }

  private indexPage(rowid: number, title: string, domain: string, text: string): void {
    this.db.query('DELETE FROM pages_fts WHERE rowid = ?').run(rowid);
    this.db.query('INSERT INTO pages_fts (rowid, title, domain, body) VALUES (?, ?, ?, ?)').run(rowid, tokens(title), tokens(domain.replaceAll('.', ' ')), tokens(text));
  }

  private unindexPages(where: string, ...params: string[]): void {
    this.db.query(`DELETE FROM pages_fts WHERE rowid IN (SELECT rowid FROM pages WHERE ${where})`).run(...params);
  }

  /** Applies events in one transaction and returns how many were stored. Deleted history is refused. */
  ingest(events: IngestEvent[], now = Date.now()): number {
    if (events.length === 0) return 0;
    let stored = 0;
    const happened: TacitEvent[] = [];
    this.db.transaction(() => {
      for (const ev of events) {
        const forgotten = ev.kind === 'ledger' ? this.isForgotten(ev.entry.url, ev.entry.createdAt ?? ev.entry.at) : this.isForgotten(ev.visit.url, ev.visit.startedAt);
        if (forgotten) continue;
        stored++;
        this.record(eventOf(ev), now, happened);
        if (ev.kind === 'page') {
          this.putPage(ev.page, now);
          this.putVisit(ev.visit, now);
        } else if (ev.kind === 'visit') {
          this.putVisit(ev.visit, now);
        } else {
          this.putLedger(ev.entry);
        }
      }
      this.prune();
    })();
    this.announce(happened);
    return stored;
  }

  /** The latest deletion, if anything was ever deleted. */
  forgetAt(): number | undefined {
    return this.forgotten.size ? Math.max(...this.forgotten.values()) : undefined;
  }

  /** What was deleted after `since`, for copies of the trail kept elsewhere (the extension keeps one). */
  forgottenSince(since: number): ForgottenResponse {
    const all = this.forgotten.get(ALL);
    return {
      at: this.forgetAt() ?? 0,
      all: all !== undefined && all > since ? all : undefined,
      pages: [...this.forgotten].filter(([key, at]) => key !== ALL && at > since).map(([key, at]) => ({ key, at })),
    };
  }

  private isForgotten(url: string, at: number): boolean {
    if (at <= (this.forgotten.get(ALL) ?? -Infinity)) return true;
    if (this.forgotten.size === (this.forgotten.has(ALL) ? 1 : 0)) return false;
    return at <= (this.forgotten.get(forgetKeySync(url)) ?? -Infinity);
  }

  private loadForgotten(): void {
    const rows = this.db.query<{ key: string; at: number }, []>('SELECT key, at FROM forgotten').all();
    this.forgotten = new Map(rows.map((r) => [r.key, r.at]));
  }

  counts(): { visits: number; pages: number } {
    return this.db
      .query<{ visits: number; pages: number }, []>(
        'SELECT (SELECT COUNT(*) FROM visits) AS visits, (SELECT COUNT(*) FROM pages) AS pages',
      )
      .get()!;
  }

  /** The visit the user is on: the latest-updated open visit, else the latest-updated one. */
  /** The open visit, else the latest one; `accept` passes over visits that should not count, like redirects. */
  currentVisit(accept: (v: Visit) => boolean = () => true): Visit | null {
    const rows = this.db
      .query<JsonRow, []>(
        `SELECT data_json FROM visits
         ORDER BY json_extract(data_json, '$.endedAt') IS NULL DESC, updated_at DESC, started_at DESC
         LIMIT 20`,
      )
      .all();
    for (const row of rows) {
      const v = JSON.parse(row.data_json) as Visit;
      if (accept(v)) return v;
    }
    return null;
  }

  /** Newest first by start time. */
  /** When the extension last sent anything about a visit. */
  activeAt(id: string): number | undefined {
    return this.db.query<{ updated_at: number }, [string]>('SELECT updated_at FROM visits WHERE id = ?').get(id)?.updated_at;
  }

  recentVisits(limit: number): Visit[] {
    return this.db
      .query<JsonRow, [number]>('SELECT data_json FROM visits ORDER BY started_at DESC LIMIT ?')
      .all(limit)
      .map((r) => JSON.parse(r.data_json) as Visit);
  }

  visitsFor(url: string, limit: number): Visit[] {
    return this.db
      .query<JsonRow, [string, number]>('SELECT data_json FROM visits WHERE url = ? ORDER BY started_at DESC LIMIT ?')
      .all(url, limit)
      .map((r) => JSON.parse(r.data_json) as Visit);
  }

  page(url: string): PageModel | null {
    const row = this.db.query<{ model_json: string }, [string]>('SELECT model_json FROM pages WHERE url = ?').get(url);
    return row ? (JSON.parse(row.model_json) as PageModel) : null;
  }

  /** Full-text search over every page kept, best match first. Search result pages are left out. */
  searchPages(terms: string[], limit: number): PageHit[] {
    if (terms.length === 0) return [];
    const match = terms.map((t) => `"${t.replaceAll('"', '""')}"`).join(' OR ');
    return this.db
      .query<PageHit, Record<string, string | number>>(
        `SELECT p.url, p.title, p.domain, p.last_seen AS lastSeen, -bm25(pages_fts, ${TITLE_WEIGHT}, 1.0, 1.0) AS score
         FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid
         WHERE pages_fts MATCH $match AND p.kind != 'search'
         ORDER BY score DESC, p.last_seen DESC LIMIT $limit`,
      )
      .all({ match, limit });
  }

  /** Newest first. */
  ledger(limit: number): LedgerEntry[] {
    return this.db
      .query<JsonRow, [number]>('SELECT data_json FROM ledger ORDER BY at DESC LIMIT ?')
      .all(limit)
      .map((r) => JSON.parse(r.data_json) as LedgerEntry);
  }

  /** Library rows with what the user gave each page: visits, time, passages read closely, selections. */
  pageSummaries(q: SummaryQuery): { pages: PageSummary[]; total: number } {
    const params = { site: q.site ?? '', urls: q.urls ? JSON.stringify(q.urls) : null };
    const pages = this.db
      .query<PageSummary, Record<string, string | number | null>>(
        `${SUMMARY_SELECT} ORDER BY ${SUMMARY_ORDER[q.sort]} LIMIT $limit OFFSET $offset`,
      )
      .all({ ...params, limit: q.limit, offset: q.offset });
    const { n } = this.db
      .query<{ n: number }, Record<string, string | null>>(`SELECT COUNT(*) AS n FROM pages p WHERE ${SUMMARY_WHERE}`)
      .get(params)!;
    return { pages, total: n };
  }

  /** What Tacit did on one page, newest first. */
  ledgerFor(url: string, limit: number): LedgerEntry[] {
    return this.db
      .query<JsonRow, [string, number]>(
        "SELECT data_json FROM ledger WHERE json_extract(data_json, '$.url') = ? ORDER BY at DESC LIMIT ?",
      )
      .all(url, limit)
      .map((r) => JSON.parse(r.data_json) as LedgerEntry);
  }

  stats(siteLimit = 50): StatsResponse {
    const totals = this.db
      .query<Omit<StatsResponse, 'sites' | 'storage'>, []>(
        `SELECT (SELECT COUNT(*) FROM pages) AS pages, (SELECT COUNT(*) FROM visits) AS visits,
           (SELECT COUNT(*) FROM ledger) AS actions,
           (SELECT COALESCE(SUM(json_extract(data_json, '$.dwellMs')), 0) FROM visits) AS dwellMs,
           (SELECT COALESCE(SUM(json_extract(je.value, '$.ms')), 0)
              FROM visits, json_each(visits.data_json, '$.reads') AS je) AS readMs,
           (SELECT MIN(started_at) FROM visits) AS since`,
      )
      .get()!;
    const sites = this.db
      .query<{ domain: string; pages: number }, [number]>(
        "SELECT domain, COUNT(*) AS pages FROM pages WHERE domain != '' GROUP BY domain ORDER BY pages DESC, domain LIMIT ?",
      )
      .all(siteLimit);
    return { ...totals, sites, storage: this.storage() };
  }

  /** Forgets one page: the page, its visits and what Tacit did there. */
  deletePage(url: string, now = Date.now()): DeletedCounts {
    const happened: TacitEvent[] = [];
    const deleted = this.db.transaction(() => {
      // Counted before deleting: FTS5 flushes its index lazily, which inflates `changes` of later statements.
      const counts = {
        pages: this.count('SELECT COUNT(*) AS n FROM pages WHERE url = ?', url),
        visits: this.count('SELECT COUNT(*) AS n FROM visits WHERE url = ?', url),
        actions: this.count("SELECT COUNT(*) AS n FROM ledger WHERE json_extract(data_json, '$.url') = ?", url),
      };
      this.unindexPages('url = ?', url);
      this.db.query('DELETE FROM pages WHERE url = ?').run(url);
      this.db.query('DELETE FROM visits WHERE url = ?').run(url);
      this.db.query("DELETE FROM ledger WHERE json_extract(data_json, '$.url') = ?").run(url);
      // The event log names pages too; a deleted page leaves it as well.
      this.db
        .query("DELETE FROM events WHERE ? IN (json_extract(data_json, '$.visit.url'), json_extract(data_json, '$.page.url'), json_extract(data_json, '$.action.url'))")
        .run(url);
      if (counts.pages + counts.visits + counts.actions > 0) {
        this.record([{ kind: 'forgotten', all: false, pages: counts.pages }], now, happened);
        this.db.query('INSERT INTO forgotten (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at').run(forgetKeySync(url), now);
        this.db
          .query(`DELETE FROM forgotten WHERE key != '${ALL}' AND key NOT IN (SELECT key FROM forgotten WHERE key != '${ALL}' ORDER BY at DESC LIMIT ?)`)
          .run(MAX_FORGOTTEN);
      }
      return counts;
    })();
    this.announce(happened);
    this.loadForgotten();
    this.checkpoint();
    return deleted;
  }

  deleteAll(now = Date.now()): DeletedCounts {
    const happened: TacitEvent[] = [];
    const deleted = this.db.transaction(() => {
      const counts = {
        pages: this.count('SELECT COUNT(*) AS n FROM pages'),
        visits: this.count('SELECT COUNT(*) AS n FROM visits'),
        actions: this.count('SELECT COUNT(*) AS n FROM ledger'),
      };
      this.db.run("INSERT INTO pages_fts (pages_fts) VALUES ('delete-all')");
      this.db.run('DELETE FROM pages');
      this.db.run('DELETE FROM visits');
      this.db.run('DELETE FROM ledger');
      // One tombstone covers everything before now, including pages deleted one by one; so does one event.
      this.db.run('DELETE FROM forgotten');
      this.db.query('INSERT INTO forgotten (key, at) VALUES (?, ?)').run(ALL, now);
      this.db.run('DELETE FROM events');
      this.record([{ kind: 'forgotten', all: true, pages: counts.pages }], now, happened);
      return counts;
    })();
    this.announce(happened);
    this.loadForgotten();
    try {
      this.db.run('VACUUM');
    } catch (err) {
      console.error('[tacit] vacuum after delete-all skipped:', err);
    }
    this.checkpoint();
    return deleted;
  }

  close(): void {
    this.db.close();
  }

  /** Moves the WAL into the file and empties it, so deleted rows do not linger on disk. */
  private checkpoint(): void {
    this.db.run('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  private storage(): StatsResponse['storage'] {
    const size = (p: string) => (existsSync(p) ? statSync(p).size : 0);
    return { path: this.path, display: tilde(this.path), bytes: size(this.path) + size(`${this.path}-wal`) };
  }

  private putPage(incoming: PageModel, now: number): void {
    // A page read before it loaded, or a redirect on its way out, reads as empty: it never replaces what an earlier
    // visit to the same address read. A title that is only the address never replaces a real one either.
    const kept = this.db.query<{ n: number; title: string }, [string]>('SELECT length(text) AS n, title FROM pages WHERE url = ?').get(incoming.url);
    if (kept && kept.n > 0 && incoming.blocks.length === 0) {
      this.db.query('UPDATE pages SET last_seen = ? WHERE url = ?').run(now, incoming.url);
      return;
    }
    const page = kept && kept.title !== incoming.url && incoming.title === incoming.url ? { ...incoming, title: kept.title } : incoming;
    this.db
      .query(
        `INSERT INTO pages (url, title, domain, kind, model_json, text, first_seen, last_seen)
         VALUES ($url, $title, $domain, $kind, $model, $text, $now, $now)
         ON CONFLICT (url) DO UPDATE SET title = excluded.title, domain = excluded.domain, kind = excluded.kind,
           model_json = excluded.model_json, text = excluded.text, last_seen = excluded.last_seen`,
      )
      .run({
        url: page.url,
        title: page.title,
        domain: page.domain,
        kind: page.kind,
        model: JSON.stringify(page),
        text: page.blocks.map((b) => b.text).join('\n'),
        now,
      });
    const { rowid } = this.db.query<{ rowid: number }, [string]>('SELECT rowid FROM pages WHERE url = ?').get(page.url)!;
    this.indexPage(rowid, page.title, page.domain, page.blocks.map((b) => b.text).join('\n'));
  }

  private putVisit(visit: Visit, now: number): void {
    this.db
      .query(
        `INSERT INTO visits (id, url, started_at, updated_at, data_json) VALUES ($id, $url, $startedAt, $now, $data)
         ON CONFLICT (id) DO UPDATE SET url = excluded.url, started_at = excluded.started_at,
           updated_at = excluded.updated_at, data_json = excluded.data_json`,
      )
      .run({ id: visit.id, url: visit.url, startedAt: visit.startedAt, now, data: JSON.stringify(visit) });
  }

  private putLedger(entry: LedgerEntry): void {
    this.db
      .query(
        `INSERT INTO ledger (id, at, data_json) VALUES ($id, $at, $data)
         ON CONFLICT (id) DO UPDATE SET at = excluded.at, data_json = excluded.data_json`,
      )
      .run({ id: entry.id, at: entry.at, data: JSON.stringify(entry) });
  }

  /** Keeps the newest visits and drops pages that no kept visit points to and nobody has seen since. */
  private prune(): void {
    this.db.query('DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?').run(MAX_EVENTS);
    const { n } = this.db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM visits').get()!;
    if (n <= this.maxVisits) return;
    this.db
      .query('DELETE FROM visits WHERE id NOT IN (SELECT id FROM visits ORDER BY updated_at DESC, started_at DESC LIMIT ?)')
      .run(this.maxVisits);
    const stale = 'url NOT IN (SELECT url FROM visits) AND last_seen < (SELECT MIN(updated_at) FROM visits)';
    this.unindexPages(stale);
    this.db.run(`DELETE FROM pages WHERE ${stale}`);
  }
}
