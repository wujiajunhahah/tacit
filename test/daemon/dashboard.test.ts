import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import type { CalibrationResponse, ConnectResponse, PageDetailResponse, PagesResponse, StatsResponse } from '../../core';
import { CONFIRM_DELETE_ALL, CONFIRM_HEADER } from '../../daemon/guard';
import { startHarness, type Harness } from '../../daemon/server';
import { articlePage, authed, EXTENSION, getJson, ledgerEntry, pageEvent, post, removeHome, simplePage, tempHome, trust, visitTo, zhPage } from './helpers';

let home: string;
let h: Harness;
const article = articlePage();
const zh = zhPage();
const other = simplePage('https://other.example/', 'Other', 'Another page entirely.');

const del = (path: string, headers: Record<string, string> = {}) => fetch(`${h.url}${path}`, { method: 'DELETE', headers: authed(h.url, headers) });

beforeAll(async () => {
  home = tempHome();
  h = startHarness({ port: 0, home, env: {} });
  trust(h);
  const reads = Array.from({ length: 35 }, (_, i) => ({ blockId: `filler-${i}`, text: 'x'.repeat(400), ms: 1000 + i, via: 'view', at: Date.now() }));
  reads[0] = { blockId: article.blocks[2]!.id, text: article.blocks[2]!.text, ms: 9000, via: 'pointer', at: Date.now() };
  const res = await post(h.url, '/v1/ingest', {
    events: [
      pageEvent(article, { ...visitTo(article), reads } as never),
      pageEvent(zh, visitTo(zh)),
      pageEvent(other, visitTo(other)),
      ...Array.from({ length: 6 }, (_, i) => ({
        kind: 'ledger',
        entry: ledgerEntry({ id: `jump-${i}`, at: Date.now() - (10 - i) * 1000, url: article.url, state: i % 2 ? 'undone' : 'executed', confidence: 0.7 }),
      })),
    ],
  });
  expect(((await res.json()) as { accepted: number }).accepted).toBe(9);
});

afterAll(async () => {
  await h.stop();
  removeHome(home);
});

describe('library API', () => {
  test('reads survive ingest, trimmed to the contract instead of rejected', async () => {
    const d = await getJson<PageDetailResponse>(h.url, `/v1/page?url=${encodeURIComponent(article.url)}`);
    const stored = d.visits[0]!.reads!;
    expect(stored).toHaveLength(30);
    expect(Math.max(...stored.map((r) => r.text.length))).toBeLessThanOrEqual(300);
    expect(d.reads.find((r) => r.blockId === article.blocks[2]!.id)).toMatchObject({ ms: 9000, via: 'pointer' });
  });

  test('lists, sorts, filters and validates', async () => {
    const all = await getJson<PagesResponse>(h.url, '/v1/pages');
    expect(all.total).toBe(3);
    const top = await getJson<PagesResponse>(h.url, '/v1/pages?sort=attention&limit=1');
    expect(top.pages.map((p) => p.url)).toEqual([article.url]);
    const site = await getJson<PagesResponse>(h.url, `/v1/pages?site=${encodeURIComponent('zh.example.com')}`);
    expect(site.pages.map((p) => p.url)).toEqual([zh.url]);
    const found = await getJson<PagesResponse>(h.url, `/v1/pages?q=${encodeURIComponent('上下文')}`);
    expect(found.pages[0]?.url).toBe(zh.url);
    expect((await fetch(`${h.url}/v1/pages?sort=loudest`, { headers: authed(h.url) })).status).toBe(400);
    expect((await fetch(`${h.url}/v1/pages?limit=5000`, { headers: authed(h.url) })).status).toBe(400);
  });

  test('stats and connect describe this machine', async () => {
    const stats = await getJson<StatsResponse>(h.url, '/v1/stats');
    expect(stats).toMatchObject({ pages: 3, visits: 3, actions: 6 });
    expect(stats.storage.path).toBe(h.dbPath);
    const c = await getJson<ConnectResponse>(h.url, '/v1/connect');
    expect(c.engine).toBe('local');
    expect(c.mcpPath).toEndWith('/daemon/mcp.ts');
    expect(existsSync(c.mcpPath)).toBe(true);
    expect(c.claudeCommand).toStartWith('claude mcp add --scope user');
    expect(c.claudeCommand).toContain(`--env TACIT_HOME=${home} --transport stdio tacit --`);
    expect(c.claudeCommand).toEndWith(c.mcpPath);
    expect(c.mcpConfig.mcpServers.tacit).toEqual({ command: process.execPath, args: [c.mcpPath], env: { TACIT_HOME: home } });
    // Any agent with a terminal: the command, and the line for its instructions.
    expect(c.cli).toBe(`env TACIT_HOME=${home} ${process.execPath} ${c.mcpPath.replace(/mcp\.ts$/, 'cli.ts')}`);
    expect(c.agentLine).toStartWith(`\`${c.cli}\` prints what the user has open in their browser`);
  });

  test('calibration reads the stored ledger', async () => {
    const c = await getJson<CalibrationResponse>(h.url, '/v1/calibration');
    expect(c.thresholds.act).toBeGreaterThan(0.6);
    expect(c.changes.map((x) => x.kind)).toContain('act-raised');
    expect(c.sample).toMatchObject({ executed: 3, undone: 3 });
  });
});

describe('deleting', () => {
  test('only the dashboard or a local script may delete', async () => {
    const url = `/v1/page?url=${encodeURIComponent(other.url)}`;
    expect((await del(url, { Origin: EXTENSION })).status).toBe(403);
    expect((await del(url, { Origin: 'https://evil.example' })).status).toBe(403);
    const preflight = await fetch(`${h.url}/v1/page`, { method: 'OPTIONS', headers: { Origin: EXTENSION, 'Access-Control-Request-Method': 'DELETE' } });
    expect(preflight.headers.get('access-control-allow-methods')).not.toContain('DELETE');

    const ok = await del(url, { Origin: `http://127.0.0.1:${h.port}` });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, deleted: { pages: 1, visits: 1, actions: 0 } });
    expect((await del(url)).status).toBe(404);
    expect((await del('/v1/page')).status).toBe(400);
  });

  test('deleting everything needs the confirmation header', async () => {
    expect((await del('/v1/all')).status).toBe(400);
    expect((await del('/v1/all', { [CONFIRM_HEADER]: 'yes' })).status).toBe(400);
    expect((await del('/v1/all', { [CONFIRM_HEADER]: CONFIRM_DELETE_ALL, Origin: EXTENSION })).status).toBe(403);
    expect((await fetch(`${h.url}/v1/all`, { headers: authed(h.url) })).status).toBe(405);

    const res = await del('/v1/all', { [CONFIRM_HEADER]: CONFIRM_DELETE_ALL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: { pages: 2, visits: 2, actions: 6 } });
    expect(await getJson<StatsResponse>(h.url, '/v1/stats')).toMatchObject({ pages: 0, visits: 0, actions: 0 });
  });
});
