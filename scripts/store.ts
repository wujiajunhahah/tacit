// Renders the Chrome Web Store images into docs/store: five 1280×800 screenshots, the 440×280 small promo tile
// and the 128×128 store icon. Screenshots are real captures of the demo site with the built extension and a
// harness on a throwaway ledger, framed in Tacit's ink, paper and lime.

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { HARNESS_ORIGIN, HARNESS_PORT, type CurrentContextResponse } from '../core';
import { startHarness } from '../daemon/server';
import { startDemo } from '../demo/serve';
import { capsuleText, launch, openSlip, ROOT } from './browser';

const OUT = join(ROOT, 'docs/store');
/** The browser window inside each screenshot. Pages are captured at 2x. */
const FRAME = { width: 1120, height: 584 };
/** Murmur's three columns need 1260 px, so the feed and the ledger are captured wider and drawn at 0.875. */
const WIDE = { width: 1280, height: 667 };
const POPUP_WIDTH = 340;
const LOGO = await Bun.file(join(ROOT, 'docs/assets/logo.svg')).text();
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';

interface Shot {
  file: string;
  title: string;
  note: string;
  capture: Buffer;
  /** Laid over the window: the popup, or the packet as the agent receives it. */
  inset?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const png = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;

function frame(s: Shot): string {
  return `<!doctype html><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { margin: 0; width: 1280px; height: 800px; overflow: hidden; position: relative; background: #fafaf7; color: #17161c; font-family: ${SANS}; -webkit-font-smoothing: antialiased; }
h1 { position: absolute; left: 80px; top: 50px; margin: 0; font-size: 40px; line-height: 48px; font-weight: 700; letter-spacing: -0.028em; }
p { position: absolute; left: 80px; top: 106px; margin: 0; font-size: 19px; line-height: 27px; color: rgba(23, 22, 28, 0.62); }
.brand { position: absolute; right: 80px; top: 60px; display: flex; align-items: center; gap: 10px; font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
.brand svg { width: 28px; height: 28px; }
.window { position: absolute; left: 80px; top: 172px; width: ${FRAME.width}px; height: ${FRAME.height}px; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px rgba(23, 22, 28, 0.1), 0 28px 56px -32px rgba(23, 22, 28, 0.3); }
.window img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.inset { position: absolute; top: 262px; border-radius: 10px; overflow: hidden; background: #fafaf7; box-shadow: 0 0 0 1px rgba(23, 22, 28, 0.12), 0 24px 48px -18px rgba(23, 22, 28, 0.42); }
.inset img { display: block; width: ${POPUP_WIDTH}px; }
.popup { left: 826px; }
.packet { right: 40px; width: 400px; padding: 16px 18px 18px; font: 11.5px/1.6 ${MONO}; }
.packet div { white-space: pre-wrap; }
.packet .head { margin-bottom: 8px; font: 600 11px/1 ${SANS}; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(23, 22, 28, 0.42); }
</style>
<h1>${esc(s.title)}</h1>
<p>${esc(s.note)}</p>
<div class="brand">${LOGO}<span>Tacit</span></div>
<div class="window"><img src="${png(s.capture)}"></div>
${s.inset ?? ''}`;
}

const PROMO = `<!doctype html><meta charset="utf-8"><style>
* { box-sizing: border-box; }
body { margin: 0; width: 440px; height: 280px; overflow: hidden; position: relative; background: #17161c; color: #fafaf7; font-family: ${SANS}; -webkit-font-smoothing: antialiased; }
.mark { position: absolute; left: 40px; top: 52px; width: 22px; height: 22px; background: #9ecd2e; transform: rotate(45deg); }
h1 { position: absolute; left: 78px; top: 34px; margin: 0; font-size: 54px; line-height: 60px; font-weight: 700; letter-spacing: -0.035em; }
p { position: absolute; left: 36px; top: 114px; width: 340px; margin: 0; font-size: 18px; line-height: 24px; letter-spacing: -0.01em; color: rgba(250, 250, 247, 0.66); }
.line { position: absolute; left: 36px; bottom: 34px; display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px 0 11px; border-radius: 6px; background: #fbfaf7; color: #17161c; font-size: 12px; white-space: nowrap; }
.line i { flex: none; width: 6px; height: 6px; transform: rotate(45deg); background: #17161c; }
.line span { color: rgba(23, 22, 28, 0.4); }
</style>
<div class="mark"></div>
<h1>Tacit</h1>
<p>Your agent should already know what you’re looking at.</p>
<div class="line"><i></i><span>Jump to</span>Latency: why 400 ms matters<span>· from your search</span></div>`;

/** 96px of artwork in 16px of transparent padding, with a faint glow so the ink tile holds on dark backgrounds. */
const ICON = `<!doctype html><style>
body { margin: 0; width: 128px; height: 128px; display: grid; place-items: center; }
svg { width: 96px; height: 96px; filter: drop-shadow(0 0 0.75px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 3px rgba(255, 255, 255, 0.14)); }
</style>${LOGO}`;

async function render(browser: Browser, html: string, file: string, size: { width: number; height: number }, transparent = false): Promise<void> {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const overflow = await page.evaluate(() => [...document.querySelectorAll('h1, p, .line')].some((el) => el.getBoundingClientRect().right > innerWidth));
  if (overflow) throw new Error(`${file}: text runs past the edge`);
  await page.screenshot({ path: join(OUT, file), omitBackground: transparent });
  await page.close();
  console.log(`docs/store/${file}`);
}

/** Reads the capsule's state attributes, e.g. whether the slip is open or a toast is up. */
function capsuleHas(page: Page, attr: string): Promise<boolean> {
  return page.evaluate((a) => !!document.querySelector('tacit-capsule')?.shadowRoot?.querySelector(`.tc[${a}]`), attr);
}

await Bun.$`bun run ${join(ROOT, 'scripts/build.ts')}`.quiet();
mkdirSync(OUT, { recursive: true });
const home = mkdtempSync(join(tmpdir(), 'tacit-store-'));
const harness = startHarness({ port: HARNESS_PORT, home, env: { TACIT_HOME: home } });
const demo = startDemo({ port: 0 });
const site = demo.url.replace(/\/$/, '');
const b = await launch(FRAME);
const plain = await chromium.launch({ channel: 'chromium' });

async function currentUrl(): Promise<string> {
  const res = (await (await fetch(`${HARNESS_ORIGIN}/v1/context/current`)).json()) as CurrentContextResponse;
  return res.visit?.url ?? '';
}

async function searchThenOpen(page: Page, query: string, target: string): Promise<void> {
  await page.goto(`${site}/search.html?q=${encodeURIComponent(query).replace(/%20/g, '+')}`);
  await capsuleText(page);
  await page.locator(`a[href*="${target}"]:not([href*="#"])`).first().click();
  await page.waitForURL(new RegExp(target.replace('.', '\\.')));
  await capsuleText(page);
}

try {
  const shots: Shot[] = [];
  const page = await b.context.newPage();

  await searchThenOpen(page, 'decision latency', 'article.html');
  await openSlip(page);
  shots.push({
    file: 'screenshot-1-intent.png',
    title: 'From your search to the answer.',
    note: 'You searched “decision latency”. Tacit says so, and points to the passage that answers it.',
    capture: await page.screenshot(),
  });

  await page.mouse.move(40, 40);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Alt+Shift+KeyC');
  await page.waitForTimeout(700);
  if ((await capsuleHas(page, 'data-open')) || !(await capsuleHas(page, 'data-toast'))) throw new Error('handoff: expected the toast, not the slip');
  const packet = await page.evaluate(() => navigator.clipboard.readText());
  const [, tokens, full] = packet.match(/~(\d+) tokens instead of ~(\d+)/) ?? [];
  if (!tokens || !full) throw new Error('handoff: no token counts in the packet');
  const lines = packet.split('\n').slice(0, 13);
  shots.push({
    file: 'screenshot-2-handoff.png',
    title: 'Hand the page to your agent.',
    note: `⌥⇧C copies what matters: ${Number(tokens).toLocaleString('en-US')} tokens instead of the page’s ${Number(full).toLocaleString('en-US')}.`,
    capture: await page.screenshot(),
    inset: `<div class="inset packet"><div class="head">On your clipboard</div>${lines.map((l) => `<div>${esc(l) || ' '}</div>`).join('')}</div>`,
  });

  await page.setViewportSize(WIDE);
  await searchThenOpen(page, 'agent context copy paste', 'feed.html');
  await page.waitForTimeout(600);
  const feed = await page.screenshot();
  await page.setViewportSize(FRAME);

  // Holding ⌥ shows the key next to each action.
  await searchThenOpen(page, 'install reflex', 'repo.html');
  await page.keyboard.down('Alt');
  await page.waitForTimeout(200);
  if (!(await capsuleHas(page, 'data-keys'))) throw new Error('repo: key hints did not appear');
  shots.push({
    file: 'screenshot-3-command.png',
    title: 'The command you came for, one key away.',
    note: 'Came to install? Tacit finds the command in the README. ⌥↵ copies it.',
    capture: await page.screenshot(),
  });
  await page.keyboard.up('Alt');
  shots.push({
    file: 'screenshot-4-feed.png',
    title: 'A feed, folded around what you came for.',
    note: 'Posts that don’t match your search fold into one line. One click brings them back.',
    capture: feed,
  });

  // The ledger should show the page just read, so wait until the harness has it.
  for (let i = 0; !(await currentUrl()).includes('repo.html'); i++) {
    if (i > 50) throw new Error('the harness never received the repo visit');
    await Bun.sleep(100);
  }
  await page.setViewportSize(WIDE);
  await page.goto(`${HARNESS_ORIGIN}/`);
  await page.waitForTimeout(1500);
  const ledger = await page.screenshot();
  // The popup names the active tab's site, so it loads while the ledger tab is in front.
  const popup = await b.context.newPage();
  await popup.setViewportSize({ width: POPUP_WIDTH, height: 600 });
  await popup.goto(`chrome-extension://${b.extensionId}/popup.html`);
  await page.bringToFront();
  await popup.reload();
  await popup.waitForTimeout(900);
  await popup.setViewportSize({ width: POPUP_WIDTH, height: await popup.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height)) });
  shots.push({
    file: 'screenshot-5-local.png',
    title: 'Local by default.',
    note: 'Pages and actions go to a ledger on 127.0.0.1. Pause any site, or never read it.',
    capture: ledger,
    inset: `<div class="inset popup"><img src="${png(await popup.screenshot())}"></div>`,
  });
  await popup.close();

  for (const s of shots) await render(plain, frame(s), s.file, { width: 1280, height: 800 });
  await render(plain, PROMO, 'promo-small.png', { width: 440, height: 280 });
  await render(plain, ICON, 'icon-128.png', { width: 128, height: 128 }, true);
} finally {
  await plain.close();
  await b.close();
  await harness.stop();
  await demo.stop();
  rmSync(home, { recursive: true, force: true });
}
