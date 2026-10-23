// Tacit on real public sites, not the demo: the built extension, paired with a throwaway harness, in real Chromium.
// For each page: how long until the line shows, what Tacit read (kind, blocks), how small the packet is next to the
// page, and who made the decision. Nothing is saved; it needs the network. X needs a signed-in browser, so it is not here.
// Usage: bun run live [--headed] [--models path/to/models.json] [--only bing]
// With OPENROUTER_API_KEY or TYPESAFE_API_KEY set, the throwaway harness asks the models too, as yours would;
// --models gives it a models.json, and TACIT_PRIVACY=local keeps its decisions on this machine.

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HARNESS_ORIGIN, HARNESS_PORT, authHeader, type CurrentContextResponse, type HealthResponse } from '../core';
import { chainText, MODELS_FILE } from '../daemon/engine';
import { startHarness } from '../daemon/server';
import { capsuleText, launch, pairWith, ROOT } from './browser';

interface Site {
  name: string;
  /** Where to start: a search, so the line has an intent to work with, or the page itself. */
  url: string;
  /** Opened from the start page, when given: the way a reader arrives. */
  open?: string;
  /** At least this many blocks read from the page. */
  minBlocks: number;
}

const PACKET_BOUND = 1200;

const SITES: Site[] = [
  { name: 'Wikipedia (en)', url: 'https://en.wikipedia.org/w/index.php?search=decision+latency+human+computer+interaction&ns0=1', open: 'a[href^="/wiki/"][data-serp-pos="0"], .mw-search-result-heading a', minBlocks: 15 },
  { name: 'Wikipedia (zh)', url: 'https://zh.wikipedia.org/wiki/%E4%BA%BA%E6%A9%9F%E4%BA%A4%E4%BA%92', minBlocks: 10 },
  { name: 'GitHub repository', url: 'https://github.com/oven-sh/bun', minBlocks: 10 },
  { name: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch', minBlocks: 20 },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/', minBlocks: 20 },
  // Search engines are left out: each serves an automated browser a page of its own (hidden results, a redirect, a
  // check), never what a person sees. Their results are checked on the demo's search page in `bun run e2e`.
];

await Bun.$`bun run ${join(ROOT, 'scripts/build.ts')}`.quiet();
const home = mkdtempSync(join(tmpdir(), 'tacit-live-'));
const models = process.argv.includes('--models') ? process.argv[process.argv.indexOf('--models') + 1] : undefined;
if (models) copyFileSync(models, join(home, MODELS_FILE));
const passed = Object.fromEntries(['OPENROUTER_API_KEY', 'TYPESAFE_API_KEY', 'TACIT_PRIVACY'].flatMap((k) => (process.env[k] ? [[k, process.env[k]!]] : [])));
const harness = startHarness({ port: HARNESS_PORT, home, env: { TACIT_HOME: home, ...passed } });
console.log(`Decisions: ${chainText(harness.decisions)}`);
const b = await launch({ headless: !process.argv.includes('--headed') });
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1]?.toLowerCase() : undefined;
const sites = SITES.filter((s) => !only || s.name.toLowerCase().includes(only));
const rows: { site: string; ok: boolean; line: string; ms: number; kind: string; blocks: number; tokens: string; decided: string; note: string }[] = [];

const current = async () =>
  (await (await fetch(`${HARNESS_ORIGIN}/v1/context/current`, { headers: authHeader(harness.token) })).json()) as CurrentContextResponse;
const health = async () => (await (await fetch(`${HARNESS_ORIGIN}/v1/health`, { headers: authHeader(harness.token) })).json()) as HealthResponse;

try {
  // A fresh extension's service worker can take a moment to listen; the pairing page tries again.
  let paired = false;
  for (let i = 0; i < 3 && !paired; i++) paired = (await pairWith(b, harness.token)).startsWith('This browser is paired');
  if (!paired) throw new Error('could not pair the extension');
  for (const site of sites) {
    const page = await b.context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const before = (await health()).lastDecision?.at ?? 0;
    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      if (site.open) {
        await capsuleText(page, 15_000).catch(() => '');
        const link = page.locator(site.open).first();
        if (await link.count()) await Promise.all([page.waitForLoadState('domcontentloaded'), link.click()]);
      }
      const t0 = Date.now();
      const line = await capsuleText(page, 15_000);
      const ms = Date.now() - t0;
      // Some pages redirect once they have run (Bing does for a new session): wait for the content, up to a point.
      let ctx = await current();
      for (let waited = 0; waited < 12_000 && (ctx.page?.blocks.length ?? 0) < site.minBlocks; waited += 500) {
        await page.waitForTimeout(500);
        ctx = await current();
      }
      await page.waitForTimeout(1500);
      ctx = await current();
      // What the line says once the page has settled, not the moment it first showed.
      const settled = await capsuleText(page, 3000).catch(() => line);
      const last = (await health()).lastDecision;
      const decided = last && last.at > before ? `${last.engine} in ${last.latencyMs} ms${last.fellBack ? ', after a fallback' : ''}${last.escalated ? ', escalated' : ''}` : 'no decision asked';
      const blocks = ctx.page?.blocks.length ?? 0;
      const tokens = ctx.packet ? `${ctx.packet.tokens} of ${ctx.packet.fullPageTokens}` : 'no packet';
      // The packet carries intent and the path here too, so on a short page it can be the page's size; it must stay
      // bounded, and be smaller than any page longer than that bound.
      const small = !ctx.packet || (ctx.packet.tokens <= PACKET_BOUND && (ctx.packet.fullPageTokens <= PACKET_BOUND || ctx.packet.tokens < ctx.packet.fullPageTokens));
      const ours = errors.filter((e) => /tacit/i.test(e));
      const ok = blocks >= site.minBlocks && small && ours.length === 0;
      const note = [blocks < site.minBlocks ? `read ${blocks} blocks, expected ${site.minBlocks}+` : '', small ? '' : `packet over ${PACKET_BOUND} tokens or not smaller than the page`, ours[0] ?? ''].filter(Boolean).join('; ');
      rows.push({ site: site.name, ok, line: settled || line, ms, kind: ctx.page?.kind ?? '?', blocks, tokens, decided, note });
    } catch (err) {
      rows.push({ site: site.name, ok: false, line: '', ms: 0, kind: '?', blocks: 0, tokens: '', decided: '', note: String(err).split('\n')[0]!.slice(0, 120) });
    } finally {
      await page.close();
    }
  }
} finally {
  await b.close();
  await harness.stop();
  rmSync(home, { recursive: true, force: true });
}

for (const r of rows) {
  console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.site} · ${r.kind}, ${r.blocks} blocks · packet ${r.tokens} tokens · line in ${r.ms} ms · ${r.decided}`);
  console.log(`      “${r.line}”${r.note ? `  · ${r.note}` : ''}`);
}
const bad = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - bad}/${rows.length} real sites passed`);
process.exit(bad ? 1 : 0);
