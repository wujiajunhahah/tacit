import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngestEvent, LedgerEntry, PageModel, Visit } from '../../core';
import { articlePage, visit } from '../core/fixtures';

export { articlePage };

export const MIN = 60_000;
export const EXTENSION = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

/** A throwaway TACIT_HOME, so tests never touch ~/.tacit. */
export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'tacit-daemon-test-'));
}

export function removeHome(home: string): void {
  rmSync(home, { recursive: true, force: true });
}

export function zhPage(): PageModel {
  const blocks: PageModel['blocks'] = [
    { id: 'z0', kind: 'heading', level: 1, text: '上下文才是新的交互界面', section: '' },
    { id: 'z1', kind: 'heading', level: 2, text: '为什么不再需要复制粘贴', section: '为什么不再需要复制粘贴' },
    {
      id: 'z2',
      kind: 'para',
      text: '浏览器扩展记录用户正在看的内容，以及他们是怎样来到这里的。智能体直接读取这些上下文，用户不必再全选、复制、粘贴。',
      section: '为什么不再需要复制粘贴',
    },
    { id: 'z3', kind: 'heading', level: 2, text: '决策延迟', section: '决策延迟' },
    { id: 'z4', kind: 'para', text: '低于四百毫秒的决策延迟，让人感觉系统在和自己一起思考，而不是让人等待。', section: '决策延迟' },
  ];
  return {
    url: 'https://zh.example.com/context',
    title: '上下文才是新的交互界面',
    domain: 'zh.example.com',
    lang: 'zh',
    kind: 'article',
    blocks,
    actions: [],
    outline: blocks.filter((b) => b.kind === 'heading').map((b) => ({ level: b.level ?? 2, text: b.text, blockId: b.id })),
    textLength: blocks.reduce((n, b) => n + b.text.length, 0),
  };
}

export function searchPage(query: string): PageModel {
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    title: `${query} - Google Search`,
    domain: 'google.com',
    kind: 'search',
    blocks: [{ id: 's0', kind: 'item', text: `Results about ${query} and why it matters`, section: '' }],
    actions: [],
    outline: [],
    textLength: 40,
  };
}

export function simplePage(url: string, title: string, text: string): PageModel {
  return {
    url,
    title,
    domain: new URL(url).hostname,
    kind: 'article',
    blocks: [{ id: 'p0', kind: 'para', text, section: '' }],
    actions: [],
    outline: [],
    textLength: text.length,
  };
}

/** A visit to a page, timed relative to now so intent decay behaves as in real use. */
export function visitTo(page: PageModel, partial: Partial<Visit> = {}): Visit {
  return visit({ url: page.url, title: page.title, domain: page.domain, startedAt: Date.now() - MIN, ...partial });
}

export const pageEvent = (page: PageModel, v: Visit): IngestEvent => ({ kind: 'page', page, visit: v });

export function ledgerEntry(partial: Partial<LedgerEntry> & { id: string }): LedgerEntry {
  return {
    at: Date.now(),
    kind: 'jump',
    label: 'Jump to “Latency: why 400 ms matters”',
    state: 'suggested',
    url: 'https://example.com/context',
    reason: 'matches “latency”',
    confidence: 0.8,
    engine: 'local',
    undoable: true,
    ...partial,
  };
}

/** The search → article → selection trail most tests start from. */
export function seedTrail(): { events: IngestEvent[]; article: PageModel; zh: PageModel; current: Visit } {
  const now = Date.now();
  const zh = zhPage();
  const search = searchPage('decision latency');
  const article = articlePage();
  const current = visitTo(article, {
    startedAt: now - 4 * MIN,
    dwellMs: 90_000,
    maxScroll: 0.6,
    arrival: { kind: 'search', searchQuery: 'decision latency', fromUrl: search.url, fromTitle: search.title, viaLabel: article.title },
    selections: [{ text: 'Below roughly 400 milliseconds people stop waiting', at: now - MIN }],
  });
  const events = [
    pageEvent(zh, visitTo(zh, { startedAt: now - 30 * MIN, endedAt: now - 25 * MIN, dwellMs: 60_000 })),
    pageEvent(search, visitTo(search, { startedAt: now - 6 * MIN, endedAt: now - 4 * MIN, dwellMs: 5000, searchQuery: 'decision latency' })),
    pageEvent(article, current),
  ];
  return { events, article, zh, current };
}

const tokens = new Map<string, string>();

/** Calls made with post(), getJson() and authed() to this harness carry its token, as Tacit's own clients do. */
export function trust(h: { url: string; token: string }): void {
  tokens.set(h.url, h.token);
}

export function authed(base: string, headers: Record<string, string> = {}): Record<string, string> {
  const token = tokens.get(base);
  return token ? { Authorization: `Bearer ${token}`, ...headers } : headers;
}

export function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: authed(base, { 'Content-Type': 'application/json', ...headers }),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export async function getJson<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: authed(base) });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}
