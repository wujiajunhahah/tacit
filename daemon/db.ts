// The local ledger: pages, visits and harness actions in one SQLite file under $TACIT_HOME.

import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import type { DeleteResponse, ForgottenResponse, IngestEvent, LedgerEntry, PageModel, PageSummary, StatsResponse, Visit } from '../core';

export type Env = Record<string, string | undefined>;

export const MAX_VISITS = 5000;
/** Deleted pages remembered, so a stale copy of their history cannot bring them back. */
const MAX_FORGOTTEN = 1000;
/** The tombstone that stands for "everything". */
const ALL = '*';

/** Same as core's forgetKey, synchronously: the hash a deleted page is remembered by. */
export function forgetKeySync(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export function tacitHome(env: Env = process.env): string {
  return env.TACIT_HOME || join(homedir(), '.tacit');
}

/** What search needs from a page without parsing its model. */
export interface SearchablePage {
  url: string;
  title: string;
  domain: string;
  text: string;
  lastSeen: number;
}

export interface StoreOptions {
  home?: string;
  maxVisits?: number;
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

const SUMMARY_WHERE = `($site = '' OR p.domain = $site) AND ($urls IS NULL OR p.url IN (SELECT value FROM json_each($urls)))`;

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

  constructor(opts: StoreOptions = {}) {
    const home = opts.home ?? tacitHome();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    this.path = join(home, 'tacit.db');
    this.maxVisits = opts.maxVisits ?? MAX_VISITS;
    this.db = new Database(this.path, { create: true, strict: true });
    chmodSync(this.path, 0o600);
    this.db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL; PRAGMA secure_delete = ON;',
    );
    this.db.exec(SCHEMA);
    this.loadForgotten();
  }

  /** Applies events in one transaction and returns how many were stored. Deleted history is refused. */
  ingest(events: IngestEvent[], now = Date.now()): number {
    if (events.length === 0) return 0;
    let stored = 0;
    this.db.transaction(() => {
      for (const ev of events) {
        const forgotten = ev.kind === 'ledger' ? this.isForgotten(ev.entry.url, ev.entry.createdAt ?? ev.entry.at) : this.isForgotten(ev.visit.url, ev.visit.startedAt);
        if (forgotten) continue;
        stored++;
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
  currentVisit(): Visit | null {
    const row = this.db
      .query<JsonRow, []>(
        `SELECT data_json FROM visits
         ORDER BY json_extract(data_json, '$.endedAt') IS NULL DESC, updated_at DESC, started_at DESC
         LIMIT 1`,
      )
      .get();
    return row ? (JSON.parse(row.data_json) as Visit) : null;
  }

  /** Newest first by start time. */
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

  /** Pages the user read, most recently seen first. Search result pages are left out. */
  searchablePages(limit: number): SearchablePage[] {
    return this.db
      .query<SearchablePage, [number]>(
        `SELECT url, title, domain, text, last_seen AS lastSeen FROM pages WHERE kind != 'search'
         ORDER BY last_seen DESC LIMIT ?`,
      )
      .all(limit);
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
    const deleted = this.db.transaction(() => {
      const counts = {
        pages: this.db.query('DELETE FROM pages WHERE url = ?').run(url).changes,
        visits: this.db.query('DELETE FROM visits WHERE url = ?').run(url).changes,
        actions: this.db.query("DELETE FROM ledger WHERE json_extract(data_json, '$.url') = ?").run(url).changes,
      };
      if (counts.pages + counts.visits + counts.actions > 0) {
        this.db.query('INSERT INTO forgotten (key, at) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET at = excluded.at').run(forgetKeySync(url), now);
        this.db
          .query(`DELETE FROM forgotten WHERE key != '${ALL}' AND key NOT IN (SELECT key FROM forgotten WHERE key != '${ALL}' ORDER BY at DESC LIMIT ?)`)
          .run(MAX_FORGOTTEN);
      }
      return counts;
    })();
    this.loadForgotten();
    this.checkpoint();
    return deleted;
  }

  deleteAll(now = Date.now()): DeletedCounts {
    const deleted = this.db.transaction(() => {
      const counts = {
        pages: this.db.run('DELETE FROM pages').changes,
        visits: this.db.run('DELETE FROM visits').changes,
        actions: this.db.run('DELETE FROM ledger').changes,
      };
      // One tombstone covers everything before now, including pages deleted one by one.
      this.db.run('DELETE FROM forgotten');
      this.db.query('INSERT INTO forgotten (key, at) VALUES (?, ?)').run(ALL, now);
      return counts;
    })();
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
    const home = homedir();
    const display = this.path.startsWith(home + sep) ? `~${this.path.slice(home.length)}` : this.path;
    return { path: this.path, display, bytes: size(this.path) + size(`${this.path}-wal`) };
  }

  private putPage(page: PageModel, now: number): void {
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
    const { n } = this.db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM visits').get()!;
    if (n <= this.maxVisits) return;
    this.db
      .query('DELETE FROM visits WHERE id NOT IN (SELECT id FROM visits ORDER BY updated_at DESC, started_at DESC LIMIT ?)')
      .run(this.maxVisits);
    this.db.run(
      'DELETE FROM pages WHERE url NOT IN (SELECT url FROM visits) AND last_seen < (SELECT MIN(updated_at) FROM visits)',
    );
  }
}
