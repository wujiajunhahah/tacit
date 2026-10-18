// End-to-end: real Chromium + the built extension + the demo site + a harness on a throwaway ledger.
// Usage: bun run scripts/e2e.ts [--headed] [--live]

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Page } from 'playwright';
import { HARNESS_ORIGIN, HARNESS_PORT } from '../core';
import { startHarness } from '../daemon/server';
import { startDemo } from '../demo/serve';
import { capsuleText, launch, openSlip, ROOT } from './browser';

const headed = process.argv.includes('--headed');
const live = process.argv.includes('--live');
const shots = join(ROOT, 'docs/screenshots');
mkdirSync(shots, { recursive: true });

await Bun.$`bun run ${join(ROOT, 'scripts/build.ts')}`.quiet();

const home = mkdtempSync(join(tmpdir(), 'tacit-e2e-'));
const harness = startHarness({ port: HARNESS_PORT, home, env: { TACIT_HOME: home } });
const demo = startDemo({ port: 0 });
const site = demo.url.replace(/\/$/, '');

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(shots, `${name}.png`) });
}

async function closeSlip(page: Page): Promise<void> {
  await page.mouse.move(40, 40);
  await page.waitForTimeout(450);
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const toastText = (page: Page) => page.locator('tacit-capsule .toast').innerText();

async function api<T>(path: string): Promise<T> {
  return (await fetch(`${HARNESS_ORIGIN}${path}`)).json() as Promise<T>;
}

async function searchThenOpen(page: Page, query: string, target: string): Promise<void> {
  await page.goto(`${site}/search.html?q=${encodeURIComponent(query).replace(/%20/g, '+')}`);
  await capsuleText(page);
  await page.locator(`a[href*="${target}"]:not([href*="#"])`).first().click();
  await page.waitForURL(new RegExp(target.replace('.', '\\.')));
}

async function articleFlow(page: Page): Promise<void> {
  await searchThenOpen(page, 'decision latency', 'article.html');
  const line = await capsuleText(page);
  check('article: the line suggests jumping to the latency section', /Latency/.test(line), line);
  check('article: the line says where the prediction came from', line.includes('from your search'), line);
  const highlights = await page.locator('[data-tacit-hl]').count();
  check('article: answers are highlighted in the page', highlights > 0, `${highlights} passages`);
  await shot(page, 'article-line');

  await openSlip(page);
  const slip = (await page.locator('tacit-capsule .slip').innerText()).replace(/\s+/g, ' ');
  check('article: the slip shows the intent in your words', slip.startsWith('decision latency') && slip.includes('from your search'), slip.slice(0, 120));
  await shot(page, 'article-slip');
  await closeSlip(page);

  const y0 = await scrollY(page);
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(1100);
  const y1 = await scrollY(page);
  check('jump: ⌥↵ scrolls to the answer', y1 > y0 + 200, `${y0} → ${y1}`);
  check('jump: the toast confirms and offers undo', /Jumped to/.test(await toastText(page)), await toastText(page));
  await shot(page, 'article-jump');

  await page.keyboard.press('Alt+Shift+KeyZ');
  await page.waitForTimeout(1100);
  const y2 = await scrollY(page);
  check('undo: ⌥⇧Z goes back to where you were', Math.abs(y2 - y0) < 60, `${y1} → ${y2}`);

  await page.keyboard.press('Alt+Shift+KeyF');
  await page.waitForTimeout(400);
  const focused = await page.evaluate(() => document.documentElement.hasAttribute('data-tacit-focus'));
  const dimmed = await page.locator('[data-tacit-dim]').count();
  check('focus: ⌥⇧F dims what does not match', focused && dimmed > 0, `${dimmed} blocks dimmed`);
  await page.locator('[data-tacit-hl]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, 'article-focus');
  await page.keyboard.press('Alt+Shift+KeyF');

  await page.keyboard.press('Alt+Shift+KeyC');
  await page.waitForTimeout(700);
  const packet = await page.evaluate(() => navigator.clipboard.readText());
  check('handoff: ⌥⇧C puts a context packet on the clipboard', packet.startsWith('# Context: '), packet.split('\n')[0] ?? '');
  check('handoff: the packet says how you got here', packet.includes('searched “decision latency”'));
  const m = packet.match(/~(\d+) tokens instead of ~(\d+)/);
  check('handoff: the packet is smaller than the page', !!m && Number(m[1]) < Number(m[2]), m ? `${m[1]} vs ${m[2]} tokens` : 'no token line');
  await shot(page, 'article-handoff');
  await Bun.write(join(shots, 'packet-example.md'), packet);
}

async function feedFlow(page: Page): Promise<void> {
  await searchThenOpen(page, 'agent context copy paste', 'feed.html');
  const line = await capsuleText(page);
  check('feed: the line counts posts for the intent', /agent context copy paste · \d+ of \d+/.test(line), line);
  const folded = await page.locator('[data-tacit-folded]').count();
  const relevant = await page.locator('[data-tacit-relevant]').count();
  check('feed: unrelated posts are folded', folded > 0, `${folded} folded`);
  check('feed: relevant posts are marked', relevant > 0, `${relevant} relevant`);
  await shot(page, 'feed');

  const before = await page.locator('[data-tacit-id]').count();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(2200);
  const after = await page.locator('[data-tacit-id]').count();
  check('feed: posts loaded by infinite scroll are read too', after > before, `${before} → ${after}`);

  const runsBefore = await page.locator('[data-tacit-fold-label]').count();
  const label = page.locator('[data-tacit-fold-label]').first();
  if (await label.count()) {
    await label.scrollIntoViewIfNeeded();
    await label.click({ position: { x: 30, y: 12 } });
    await page.waitForTimeout(300);
  }
  const runsAfter = await page.locator('[data-tacit-fold-label]').count();
  check('feed: clicking a fold shows those posts again', runsAfter < runsBefore, `${runsBefore} → ${runsAfter} folds`);
}

async function repoFlow(page: Page): Promise<void> {
  await searchThenOpen(page, 'install reflex', 'repo.html');
  const line = await capsuleText(page);
  check('repo: the line hands you the install command', /^Copy .*install/i.test(line), line);
  await shot(page, 'repo');
}

async function harnessChecks(page: Page): Promise<void> {
  await page.waitForTimeout(2500);
  const trail = await api<{ visit: { arrival: { kind: string; searchQuery?: string } } }[]>('/v1/trail?limit=50');
  check('harness: the trail reached the local ledger', trail.length >= 5, `${trail.length} visits`);
  check(
    'harness: arrivals from search are recorded',
    trail.some((t) => t.visit.arrival.kind === 'search' && t.visit.arrival.searchQuery === 'decision latency'),
  );
  const ledger = await api<{ kind: string; state: string }[]>('/v1/ledger?limit=100');
  const has = (kind: string, state: string) => ledger.some((e) => e.kind === kind && e.state === state);
  check('harness: the action ledger has the undone jump and the handoff', has('jump', 'undone') && has('handoff', 'executed'), ledger.map((e) => `${e.kind}:${e.state}`).join(' '));
  const hits = await api<{ title: string }[]>('/v1/search?q=latency');
  check('harness: past pages are searchable', hits.some((h) => /context harness/i.test(h.title)), hits.map((h) => h.title).join(' | '));
  const current = await api<{ packet: { markdown: string } | null }>('/v1/context/current');
  check('harness: agents can read the current context', !!current.packet?.markdown.startsWith('# Context'));

  await page.goto(`${HARNESS_ORIGIN}/`);
  await page.waitForTimeout(1500);
  await shot(page, 'ledger');

  const popup = await b.context.newPage();
  await popup.setViewportSize({ width: 340, height: 460 });
  await popup.goto(`chrome-extension://${b.extensionId}/popup.html`);
  await popup.waitForTimeout(900);
  const status = await popup.locator('#harness').innerText();
  check('popup: shows the harness connection', status === 'Harness connected', status);
  await popup.screenshot({ path: join(shots, 'popup.png') });
  await popup.close();
}

async function mcpFlow(): Promise<void> {
  const env = Object.fromEntries(Object.entries({ ...process.env, TACIT_HOME: home }).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const client = new Client({ name: 'tacit-e2e', version: '0.1.0' });
  await client.connect(new StdioClientTransport({ command: 'bun', args: [join(ROOT, 'daemon/mcp.ts')], env, stderr: 'ignore' }));
  try {
    const { tools } = await client.listTools();
    check('mcp: an agent sees the Tacit tools', tools.length === 5, tools.map((t) => t.name).join(', '));
    const textOf = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]?.text ?? '').trim();
    const context = textOf(await client.callTool({ name: 'tacit_current_context', arguments: {} }));
    check('mcp: tacit_current_context returns the open page', context.startsWith('# Context'), context.split('\n')[0] ?? '');
    const intent = textOf(await client.callTool({ name: 'tacit_intent', arguments: {} }));
    const found = textOf(await client.callTool({ name: 'tacit_search', arguments: { query: 'decision latency' } }));
    check('mcp: tacit_search finds what the user read', /context harness/i.test(found), found.split('\n').slice(0, 2).join(' '));
    await Bun.write(
      join(shots, 'agent-view.md'),
      `# What an agent sees over MCP\n\nCaptured by \`bun run e2e\` after the demo flows.\n\n## tacit_current_context\n\n${context}\n\n## tacit_intent\n\n${intent}\n\n## tacit_search("decision latency")\n\n${found}\n`,
    );
  } finally {
    await client.close();
  }
}

async function askFlow(): Promise<void> {
  const b = await launch({ headless: !headed });
  try {
    const page = await b.context.newPage();
    await page.goto(`${site}/article.html`);
    await capsuleText(page);
    const mode = await page.locator('tacit-capsule .tc').getAttribute('data-mode');
    check('ask: with no context the line stays quiet instead of guessing', mode === 'ask' || mode === 'quiet', `mode ${mode}`);
    await openSlip(page);
    await shot(page, 'ask');
    const choice = page.locator('tacit-capsule .choice', { hasText: 'Latency' }).first();
    check('ask: section titles are offered as choices', (await choice.count()) > 0);
    if (await choice.count()) {
      await choice.click();
      await page.waitForTimeout(800);
      await closeSlip(page);
      const picked = await capsuleText(page);
      check('ask: picking a choice makes the line act on it', /Latency/.test(picked) && picked.includes('you said'), picked);
      await shot(page, 'ask-picked');
    }
  } finally {
    await b.close();
  }
}

async function darkFlow(): Promise<void> {
  const b = await launch({ headless: !headed, colorScheme: 'dark' });
  try {
    const page = await b.context.newPage();
    await searchThenOpen(page, 'decision latency', 'article.html');
    await capsuleText(page);
    await openSlip(page);
    await shot(page, 'article-dark');
  } finally {
    await b.close();
  }
}

async function liveFlow(): Promise<void> {
  const b = await launch({ headless: !headed });
  try {
    const page = await b.context.newPage();
    await page.goto('https://en.wikipedia.org/w/index.php?search=human+computer+interaction+history');
    await page.waitForLoadState('domcontentloaded');
    const line = await capsuleText(page, 15000);
    check('live: Tacit runs on a real site', line.length > 0, line);
    await shot(page, 'live-wikipedia');
  } finally {
    await b.close();
  }
}

let failed = false;
const b = await launch({ headless: !headed });
const errors: string[] = [];
b.worker.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_CONNECTION_REFUSED') && errors.push(`[worker] ${m.text()}`));
try {
  const page = await b.context.newPage();
  page.on('pageerror', (e) => errors.push(`[page] ${e.message}`));
  await articleFlow(page);
  await feedFlow(page);
  await repoFlow(page);
  await harnessChecks(page);
  await mcpFlow();
  await askFlow();
  await darkFlow();
  if (live) await liveFlow();
  check('no errors in the page or the service worker', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await b.close();
  await harness.stop();
  await demo.stop();
  rmSync(home, { recursive: true, force: true });
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; failing: ${bad.map((r) => r.name).join('; ')}` : ''}`);
process.exit(failed || bad.length ? 1 : 0);
