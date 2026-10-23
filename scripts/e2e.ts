// End-to-end: real Chromium + the built extension + the demo site + a harness on a throwaway ledger.
// Usage: bun run scripts/e2e.ts [--headed] [--live]

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Page } from 'playwright';
import { HARNESS_ORIGIN, HARNESS_PORT, authHeader, type Block, type CurrentContextResponse } from '../core';
import { startHarness } from '../daemon/server';
import { startDemo } from '../demo/serve';
import { capsuleText, launch, openSlip, pairWith, ROOT, searchThenOpen as openFrom } from './browser';

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

/** Screenshots go into a public repo: no local paths in them. */
async function maskPaths(page: Page): Promise<void> {
  const swaps: [string, string][] = [[realpathSync(home), '~/.tacit'], [home, '~/.tacit'], [homedir(), '~']];
  await page.evaluate((pairs) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let text = n.textContent ?? '';
      for (const [from, to] of pairs) text = text.split(from).join(to);
      if (text !== n.textContent) n.textContent = text;
    }
  }, swaps);
}

async function closeSlip(page: Page): Promise<void> {
  await page.mouse.move(40, 40);
  await page.waitForTimeout(450);
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
/** A confirmation shows in the line itself, for a few seconds. */
const toastText = (page: Page) => page.locator('tacit-capsule .tc[data-note] .line').innerText().then((s) => s.replace(/\s+/g, ' ').trim());

async function api<T>(path: string): Promise<T> {
  return (await fetch(`${HARNESS_ORIGIN}${path}`, { headers: authHeader(harness.token) })).json() as Promise<T>;
}

const searchThenOpen = (page: Page, query: string, target: string) => openFrom(page, site, query, target);

async function searchFlow(page: Page): Promise<void> {
  await page.goto(`${site}/search.html?q=decision+latency`);
  const line = await capsuleText(page);
  let blocks: Block[] = [];
  for (let i = 0; i < 10 && blocks.length < 5; i++) {
    await page.waitForTimeout(300);
    blocks = (await api<CurrentContextResponse>('/v1/context/current')).page?.blocks ?? [];
  }
  check('search: the results are read as results, title and snippet each', blocks.length >= 5 && blocks.every((b) => b.kind === 'item') && blocks[0]!.text.includes(' — '), `${blocks.length} · ${blocks[0]?.text.slice(0, 60)}`);
  const titles = blocks.map((b) => b.text.split(' — ')[0]!.slice(0, 24));
  check('search: the next step opens a result, never scrolls to one or searches again', /^Open /.test(line) && titles.some((t) => line.includes(t)), line);
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
  const head = (await page.locator('tacit-capsule .line').innerText()).replace(/\s+/g, ' ').trim();
  const slip = (await page.locator('tacit-capsule .slip').innerText()).replace(/\s+/g, ' ');
  check('article: open, the line holds your intent in your words and where it came from', head.startsWith('decision latency') && head.includes('from your search'), head);
  check('article: the slip lists the steps once, not again in the line', slip.includes('Jump to') && !head.includes('Jump to'), slip.slice(0, 120));
  await shot(page, 'article-slip');
  await closeSlip(page);

  const y0 = await scrollY(page);
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(1100);
  const y1 = await scrollY(page);
  check('jump: ⌥↵ scrolls to the answer', y1 > y0 + 200, `${y0} → ${y1}`);
  const note = await toastText(page);
  check('jump: the line confirms and offers undo', /^Jumped to .*Undo$/.test(note), note);
  await shot(page, 'article-jump');
  // Read the answer for a while, as people do: the passages in the middle of the screen become context.
  await page.waitForTimeout(9000);

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
  const lingered = packet.split('\n').filter((l) => l.startsWith('- read closely')).join('\n');
  check('handoff: the packet has the passage you lingered on', /latency|milliseconds/i.test(lingered), lingered.split('\n')[0]?.slice(0, 90) ?? 'none');
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

/** Every dashboard view renders from the real ledger, in both languages; the screenshots in docs come from here. */
async function dashboardFlow(page: Page): Promise<void> {
  const article = `${site}/article.html`;
  const views: [string, string][] = [
    ['now', '#/now'],
    ['library', '#/library'],
    ['page', `#/page?url=${encodeURIComponent(article)}`],
    ['trail', '#/trail'],
    ['learned', '#/learned'],
    ['connect', '#/connect'],
    ['privacy', '#/privacy'],
  ];
  const empty: string[] = [];
  for (const [name, hash] of views) {
    await page.goto(`${HARNESS_ORIGIN}/${hash}`);
    await page.waitForTimeout(900);
    const text = (await page.locator('#view').innerText()).trim();
    if (text.length < 40) empty.push(name);
    await maskPaths(page);
    await shot(page, `dashboard-${name}`);
  }
  check('dashboard: every view renders from the ledger', empty.length === 0, empty.length ? `empty: ${empty.join(', ')}` : `${views.length} views`);
  const library = await page.goto(`${HARNESS_ORIGIN}/#/library`).then(() => page.waitForTimeout(900)).then(() => page.locator('#view').innerText());
  check('dashboard: the library lists the pages you read', /context harness/i.test(library));
  await page.evaluate(() => localStorage.setItem('tacit.locale', 'zh-CN'));
  for (const [name, hash] of [views[1]!, views[2]!]) {
    await page.goto(`${HARNESS_ORIGIN}/${hash}`);
    await page.reload();
    await page.waitForTimeout(900);
    await shot(page, `dashboard-${name}-zh`);
  }
  const nav = await page.locator('#nav-links').innerText();
  check('dashboard: switches to Chinese', /[\u4e00-\u9fff]/.test(nav), nav.replace(/\s+/g, ' '));
  await page.evaluate(() => localStorage.removeItem('tacit.locale'));

  // Deleting a page in the dashboard reaches the extension's own copy of the trail.
  const serp = (await api<{ visit: { url: string } }[]>('/v1/trail?limit=50')).find((t) => t.visit.url.includes('search.html?q=decision'))!.visit.url;
  const status = await page.evaluate(
    (u) => fetch(`/v1/page?url=${encodeURIComponent(u)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('tacit.token')}` } }).then((r) => r.status),
    serp,
  );
  const popup = await b.context.newPage();
  await popup.goto(`chrome-extension://${b.extensionId}/popup.html`);
  await popup.waitForTimeout(1500);
  await popup.close();
  const trail = await b.worker.evaluate(async () => ((await chrome.storage.local.get('tacit:trail'))['tacit:trail'] as { url: string }[]).map((v) => v.url));
  check('dashboard: a page deleted there is forgotten by the extension too', status === 200 && !trail.includes(serp) && trail.length > 0, `${trail.length} visits left`);
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
  await dashboardFlow(page);

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
    const choices = page.locator('tacit-capsule .choice');
    const offered = await choices.count();
    check('ask: section titles are offered as choices, one key each', offered > 0 && offered <= 3, `${offered} choices`);
    if (offered) {
      const name = (await choices.first().locator('.l').innerText()).trim();
      const before = await scrollY(page);
      await choices.first().click();
      await page.waitForTimeout(800);
      await closeSlip(page);
      const note = await toastText(page);
      check('ask: picking a section takes you there in one step', (await scrollY(page)) > before + 200 && note.startsWith('Jumped to') && note.includes(name), note);
      await shot(page, 'ask-picked');
      await page.waitForTimeout(4200);
      const after = await capsuleText(page);
      check('ask: then the line moves on, on what you said', after.includes('you said') && !after.includes(`Jump to ${name}`), after);
    }
  } finally {
    await b.close();
  }
}

/** Reading with the pointer is off until the user turns it on; then a passage the pointer rests on becomes context. */
async function pointerFlow(): Promise<void> {
  const b = await launch({ headless: !headed });
  try {
    const popup = await b.context.newPage();
    await popup.goto(`chrome-extension://${b.extensionId}/popup.html`);
    await popup.waitForTimeout(500);
    await popup.locator('#pointer').check();
    await popup.locator('#dwell').fill('600');
    await popup.waitForTimeout(300);
    const saved = await b.worker.evaluate(async () => (await chrome.storage.local.get('tacit:settings'))['tacit:settings'] as { readWithPointer?: boolean; pointerDwellMs?: number } | undefined);
    check('popup: pointer reading and its threshold are saved', saved?.readWithPointer === true && saved?.pointerDwellMs === 600, JSON.stringify({ on: saved?.readWithPointer, ms: saved?.pointerDwellMs }));
    await popup.close();

    const page = await b.context.newPage();
    await searchThenOpen(page, 'decision latency', 'article.html');
    await capsuleText(page);
    const para = page.locator('h2:has-text("The context ledger") ~ p').first();
    await para.scrollIntoViewIfNeeded();
    const box = (await para.boundingBox())!;
    for (let i = 0; i < 14; i++) {
      await page.mouse.move(box.x + 40 + i * 18, box.y + 10 + (i % 3) * 4, { steps: 3 });
      await page.waitForTimeout(160);
    }
    await page.waitForTimeout(900);
    await page.mouse.move(20, 20);
    await page.keyboard.press('Alt+Shift+KeyC');
    await page.waitForTimeout(500);
    const md = await page.evaluate(() => navigator.clipboard.readText());
    const passage = (await para.innerText()).slice(0, 40);
    check('pointer: the passage the pointer rested on is in the packet', md.split('\n').some((l) => l.startsWith('- read closely') && l.includes(passage)), passage);
  } finally {
    await b.close();
  }
}

/** Tacit follows the browser's language: a Chinese browser gets Chinese, from the line to the popup. */
async function chineseFlow(): Promise<void> {
  const b = await launch({ headless: !headed, lang: 'zh-CN' });
  try {
    const page = await b.context.newPage();
    await searchThenOpen(page, '上下文 agent 复制粘贴', 'feed.html');
    const line = await capsuleText(page);
    check('zh-CN: a Chinese browser gets a Chinese line', /条里有/.test(line) && line.includes('来自你的搜索'), line);
    await openSlip(page);
    await shot(page, 'feed-zh');
    const popup = await b.context.newPage();
    await popup.setViewportSize({ width: 340, height: 560 });
    await popup.goto(`chrome-extension://${b.extensionId}/popup.html`);
    await popup.waitForTimeout(900);
    const status = await popup.locator('#harness').innerText();
    check('zh-CN: the popup speaks Chinese', /[\u4e00-\u9fff]/.test(status), status);
    await popup.screenshot({ path: join(shots, 'popup-zh.png') });
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
  const paired = await pairWith(b, harness.token);
  check('pairing: the extension and the dashboard pair through the pairing page', paired.startsWith('This browser is paired'), paired);
  const stranger = await fetch(`${HARNESS_ORIGIN}/v1/trail`).then((r) => r.status);
  check('pairing: without the token the ledger stays closed', stranger === 401, `${stranger}`);
  const page = await b.context.newPage();
  page.on('pageerror', (e) => errors.push(`[page] ${e.message}`));
  await searchFlow(page);
  await articleFlow(page);
  await feedFlow(page);
  await repoFlow(page);
  await harnessChecks(page);
  await mcpFlow();
  await askFlow();
  await pointerFlow();
  await chineseFlow();
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
