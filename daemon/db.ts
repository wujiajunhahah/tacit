// The local ledger: pages, visits and harness actions in one SQLite file under $TACIT_HOME.

import { Database } from 'bun:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { IngestEvent, LedgerEntry, PageModel, Visit } from '../core';

export type Env = Record<string, string | undefined>;

export const MAX_VISITS = 5000;

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
`;

type JsonRow = { data_json: string };

export class Store {
  readonly path: string;
  private readonly db: Database;
  private readonly maxVisits: number;

  constructor(opts: StoreOptions = {}) {
    const home = opts.home ?? tacitHome();
    mkdirSync(home, { recursive: true, mode: 0o700 });
    this.path = join(home, 'tacit.db');
    this.maxVisits = opts.maxVisits ?? MAX_VISITS;
    this.db = new Database(this.path, { create: true, strict: true });
    chmodSync(this.path, 0o600);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);
  }

  /** Applies events in one transaction and returns how many were stored. */
  ingest(events: IngestEvent[], now = Date.now()): number {
    if (events.length === 0) return 0;
    this.db.transaction(() => {
      for (const ev of events) {
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
    return events.length;
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

  close(): void {
    this.db.close();
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
