// Browser tests without the extension: the page-script build of Tacit on the demo site, in headless Chromium.
// Covers reading attention, both languages, X-style virtual timelines, private paths and calibration.
// Usage: bun run scripts/e2e-web.ts

import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { startDemo } from '../demo/serve';
import { capsuleText, LOCAL_ONLY, searchThenOpen as openFrom } from './browser';

const ROOT = new URL('..', import.meta.url).pathname;
await Bun.$`bun run ${join(ROOT, 'scripts/build.ts')}`.quiet();
const demo = startDemo({ port: 0 });
const site = demo.url.replace(/\/$/, '');
const RUNTIME = join(ROOT, 'dist/tacit-web.js');

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
}

const browser = await chromium.launch({ args: LOCAL_ONLY });
const errors: string[] = [];

async function freshPage(settings: Record<string, unknown> = {}, ledger: unknown[] = []): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site });
  await context.addInitScript(
    ({ settings, ledger }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const base = { version: 2, paused: false, pausedDomains: [], excludedDomains: [], readWithPointer: false, pointerDwellMs: 1200, locale: 'en' };
      localStorage.setItem('tacit-web:local:tacit:settings', JSON.stringify({ ...base, ...settings }));
      localStorage.setItem('tacit-web:local:tacit:ledger', JSON.stringify(ledger));
    },
    { settings, ledger },
  );
  await context.addInitScript({ path: RUNTIME });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page };
}

const line = (page: Page) => capsuleText(page, 10_000);
const searchThenOpen = (page: Page, query: string, target: string) => openFrom(page, site, query, target);

const packet = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

/** Scroll the X timeline top to bottom; for every post, the fold run it was in (null when open). */
async function sweep(page: Page): Promise<Map<string, string | null>> {
  const seen = new Map<string, string | null>();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  for (let i = 0; i < 60; i++) {
    const cells = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="cellInnerDiv"]')].map((c) => [c.dataset.id ?? '', c.querySelector('article')?.getAttribute('data-tacit-run') ?? null] as const),
    );
    for (const [id, r] of cells) if (id) seen.set(id, r);
    if (await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2)) break;
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(160);
  }
  return seen;
}

// 1. Reading with the pointer: a passage the pointer rests on becomes context.
{
  const { context, page } = await freshPage({ readWithPointer: true, pointerDwellMs: 600 });
  await searchThenOpen(page, 'decision latency', 'article.html');
  check('web runtime: the line runs without the extension', /Latency/.test(await line(page)), await line(page));
  const para = page.locator('h2:has-text("The context ledger") ~ p').first();
  await para.scrollIntoViewIfNeeded();
  const box = (await para.boundingBox())!;
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(box.x + 40 + i * 18, box.y + 10 + (i % 3) * 4, { steps: 3 });
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(900);
  await page.locator('tacit-capsule .line').hover();
  await page.waitForTimeout(400);
  const head = (await page.locator('tacit-capsule .line').innerText()).replace(/\s+/g, ' ');
  check('attention: open, the line counts passages read closely', /Read closely: \d+ passage/.test(head), head);
  await page.mouse.move(20, 20);
  await page.keyboard.press('Alt+Shift+KeyC');
  await page.waitForTimeout(500);
  const md = await packet(page);
  const passage = (await para.innerText()).slice(0, 40);
  check('attention: the passage under the pointer is in the packet', md.split('\n').some((l) => l.startsWith('- read closely') && l.includes(passage)), passage);
  await context.close();
}

// 2. Chinese: every visible string switches, and Chinese words get an upright serif.
{
  const { context, page } = await freshPage({ locale: 'zh-CN' });
  await searchThenOpen(page, '上下文 agent 复制粘贴', 'feed.html');
  const text = await line(page);
  check('i18n: the line speaks Chinese', /条里有/.test(text) && text.includes('来自你的搜索'), text);
  const fold = await page.locator('[data-tacit-fold-label]').first().getAttribute('data-tacit-fold-label');
  check('i18n: fold labels are Chinese', /^折叠了 \d+ 条 · 展开$/.test(fold ?? ''), fold ?? 'none');
  const cjk = await page.locator('tacit-capsule .you[data-cjk]').count();
  check('i18n: Chinese intent is set upright, not in synthetic italics', cjk > 0, `${cjk} spans`);
  await context.close();
}

// 3. X mode: a virtual timeline recycles posts; the memory keeps them all, and folds survive re-rendering.
{
  const { context, page } = await freshPage();
  await page.goto(`${site}/search.html?q=agent+context+copy+paste`);
  await line(page);
  await page.goto(`${site}/x/home`);
  await line(page);
  const total = await page.evaluate(() => (globalThis as any).Murmur.all.length as number);
  const first = page.locator(`[data-testid="cellInnerDiv"][data-id="${await page.evaluate(() => (globalThis as any).Murmur.all[0].id)}"]`);
  let recycled = false;
  let unmarked = 0;
  for (let y = 0; y < 40; y++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(140);
    recycled ||= (await first.count()) === 0;
    unmarked = Math.max(unmarked, await page.locator('article[data-testid="tweet"]:not([data-tacit-id])').count());
  }
  await page.waitForTimeout(900);
  const seen = Number((await line(page)).match(/of (\d+)/)?.[1] ?? 0);
  check('x mode: the timeline recycles posts that scroll away', recycled);
  check('x mode: every post scrolled past is remembered', seen === total, `${seen} of ${total} remembered`);
  check('x mode: re-rendered posts get their marks back before they paint', unmarked === 0, `${unmarked} unmarked at worst`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  const refolded = await page.locator('[data-tacit-folded]').count();
  check('x mode: folds come back on posts the page re-rendered', refolded > 0, `${refolded} folded on screen`);

  // Unfolding goes by the whole run, so posts the list re-renders later stay open.
  const runs = await sweep(page);
  const label = page.locator('[data-tacit-fold-label]').first();
  const run = await label.getAttribute('data-tacit-run');
  const members = [...runs].filter(([, r]) => r === run).map(([id]) => id);
  const pendingClick = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('tacit-web:session:tacit:tabs') ?? '{}')['1']?.pendingClick?.label ?? null);
  const clickBefore = await pendingClick();
  await label.click();
  await page.waitForTimeout(300);
  check('x mode: opening a fold is not a click on the posts it hides', (await pendingClick()) === clickBefore, String(await pendingClick()));
  const after = await sweep(page);
  const refoldedMembers = members.filter((id) => after.get(id) !== null && after.get(id) !== undefined);
  check('x mode: an unfolded run stays open as the list re-renders it', members.length > 0 && refoldedMembers.length === 0, `${members.length} posts unfolded, ${refoldedMembers.length} folded again`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);

  const relevant = page.locator('[data-tacit-relevant] [data-testid="tweetText"]').first();
  const postText = (await relevant.innerText()).slice(0, 30);
  await relevant.click();
  await page.waitForURL(/\/x\/[^/]+\/status\//);
  await page.waitForTimeout(1500);
  await line(page);
  const trail = await page.evaluate(() => JSON.parse(localStorage.getItem('tacit-web:local:tacit:trail') ?? '[]'));
  const last = trail.at(-1);
  check('x mode: opening a post is a new visit that remembers where it came from', last?.url.includes('/status/') && (last?.arrival?.viaLabel ?? '').startsWith(postText.slice(0, 20)), last?.arrival?.viaLabel ?? 'none');
  check('x mode: a conversation is never folded', (await page.locator('[data-tacit-folded]').count()) === 0);
  await context.close();
}

// 4. Private paths: moving into one stops Tacit at once.
{
  const { context, page } = await freshPage({ excludedDomains: ['127.0.0.1/x/messages'] });
  await page.goto(`${site}/x/home`);
  await line(page);
  await page.evaluate(() => history.pushState({}, '', '/x/messages'));
  await page.waitForTimeout(1500);
  check('privacy: a private path removes Tacit from the page', (await page.locator('tacit-capsule').count()) === 0);
  await context.close();
}

// 5. Calibration: a site where the user keeps unfolding stops folding.
{
  const now = Date.now();
  const fold = (i: number, state: string) => ({ id: `f${i}`, at: now - (10 - i) * 60_000, kind: 'fold', label: 'Folded', state, url: `${site}/feed.html`, reason: 'x', undoable: true });
  const { context, page } = await freshPage({}, [fold(1, 'dismissed'), fold(2, 'suggested'), fold(3, 'dismissed')]);
  await searchThenOpen(page, 'agent context copy paste', 'feed.html');
  const text = await line(page);
  check('calibration: no folds where the user keeps unfolding', (await page.locator('[data-tacit-folded]').count()) === 0 && /of \d+/.test(text), text);
  await context.close();
}

// 6. /try: the demo site serves Tacit as a page script, so a visitor with nothing installed gets the line.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${site}/try`);
  await searchThenOpen(page, 'decision latency', 'article.html');
  const text = await line(page);
  const marked = await page.evaluate(() => document.documentElement.dataset.tacit);
  check('try: the demo runs Tacit with nothing installed', /Latency/.test(text) && marked === 'web', text);
  await page.goto(`${site}/try/off`);
  await page.goto(`${site}/article.html`);
  await page.waitForTimeout(1200);
  check('try: /try/off turns it off again', (await page.locator('tacit-capsule').count()) === 0);
  await context.close();
}

// 7. Asking: with no context, ⌥1 picks the first choice, and a section is a place to go.
{
  const { context, page } = await freshPage();
  await page.goto(`${site}/article.html`);
  await line(page);
  const asking = await page.locator('tacit-capsule .tc').getAttribute('data-mode');
  const y0 = await page.evaluate(() => scrollY);
  await page.keyboard.press('Alt+Digit1');
  await page.waitForTimeout(900);
  const note = (await page.locator('tacit-capsule .tc[data-note] .line').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check('ask: ⌥1 picks the first choice and goes there', asking === 'ask' && (await page.evaluate(() => scrollY)) > y0 + 200 && note.startsWith('Jumped to'), `${asking} · ${note}`);
  await context.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
await demo.stop();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} checks passed${bad.length ? `; failing: ${bad.map((r) => r.name).join('; ')}` : ''}`);
process.exit(bad.length ? 1 : 0);
