// Records the demo flow as a video for sharing: docs/tacit-demo.mp4.

import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { HARNESS_ORIGIN, HARNESS_PORT } from '../core';
import { startHarness } from '../daemon/server';
import { startDemo } from '../demo/serve';
import { capsuleText, launch, ROOT } from './browser';

await Bun.$`bun run ${join(ROOT, 'scripts/build.ts')}`.quiet();
const home = mkdtempSync(join(tmpdir(), 'tacit-rec-'));
const videoDir = mkdtempSync(join(tmpdir(), 'tacit-video-'));
const harness = startHarness({ port: HARNESS_PORT, home, env: { TACIT_HOME: home } });
const demo = startDemo({ port: 0 });
const site = demo.url.replace(/\/$/, '');

/** A caption for the video only; Tacit itself never draws this. */
async function caption(page: Page, text: string, ms = 2200): Promise<void> {
  await page.evaluate((t) => {
    let el = document.getElementById('rec-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'rec-caption';
      el.style.cssText =
        'position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:9px 14px;border-radius:7px;' +
        'background:rgba(23,22,28,.92);color:#fafaf7;font:500 15px/1.3 -apple-system,BlinkMacSystemFont,sans-serif;' +
        'letter-spacing:-.005em;box-shadow:0 8px 24px -12px rgba(0,0,0,.5);transition:opacity .2s;pointer-events:none';
      document.documentElement.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = t ? '1' : '0';
  }, text);
  await page.waitForTimeout(ms);
}

async function typeSearch(page: Page, query: string): Promise<void> {
  await page.goto(`${site}/search.html`);
  await page.waitForTimeout(500);
  const box = page.locator('input[type="search"]:visible').first();
  await box.click();
  await box.pressSequentially(query, { delay: 45 });
  await caption(page, `Search “${query}”`, 700);
  await box.press('Enter');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
}

const b = await launch({ videoDir });
const page = await b.context.newPage();
try {
  await page.goto(`${site}/index.html`);
  await caption(page, 'Every day: Cmd+A, copy, paste into the agent. Tacit removes that step.', 2600);

  await typeSearch(page, 'decision latency');
  await caption(page, 'Open a result', 900);
  await page.locator('a[href*="article.html"]:not([href*="#"])').first().click();
  await capsuleText(page);
  await caption(page, 'Tacit already knows why you are here, and says so', 3000);
  await page.locator('tacit-capsule .line').hover();
  await caption(page, 'Intent, evidence, confidence. Nothing typed.', 3000);
  await page.mouse.move(60, 60);
  await page.waitForTimeout(400);

  await caption(page, '⌥↵  jump to the answer', 600);
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(2200);
  await caption(page, '⌥⇧F  focus: everything else fades', 600);
  await page.keyboard.press('Alt+Shift+KeyF');
  await page.waitForTimeout(2600);
  await page.keyboard.press('Alt+Shift+KeyF');

  await caption(page, '⌥⇧C  hand the page to your agent', 600);
  await page.keyboard.press('Alt+Shift+KeyC');
  await page.waitForTimeout(1800);
  await page.locator('tacit-capsule [data-act="toast"]').dispatchEvent('click');
  await caption(page, 'A few hundred tokens instead of the whole page', 3200);
  await page.mouse.move(60, 60);

  await typeSearch(page, 'agent context copy paste');
  await page.locator('a[href*="feed.html"]').first().click();
  await capsuleText(page);
  await caption(page, 'On a feed, what you did not come for folds away, with a reason', 3000);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1500);
  const fold = page.locator('[data-tacit-fold-label]').first();
  if (await fold.count()) {
    await fold.scrollIntoViewIfNeeded();
    await caption(page, 'One click brings it back. Folded, never hidden.', 600);
    await fold.click({ position: { x: 40, y: 12 } });
    await page.waitForTimeout(2200);
  }

  await typeSearch(page, 'install reflex');
  await page.locator('a[href*="repo.html"]').first().click();
  await capsuleText(page);
  await caption(page, 'Came to install? The command is one keystroke away', 2400);
  await page.keyboard.press('Alt+Enter');
  await page.waitForTimeout(2200);

  await page.goto(`${HARNESS_ORIGIN}/`);
  await caption(page, 'All of it stays on your machine, and any agent can read it over MCP', 3600);
  await caption(page, '', 400);
} finally {
  await page.close();
  await b.close();
  await harness.stop();
  await demo.stop();
  rmSync(home, { recursive: true, force: true });
}

const webm = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no video recorded');
const out = join(ROOT, 'docs/tacit-demo.mp4');
await Bun.$`ffmpeg -y -loglevel error -i ${join(videoDir, webm)} -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart ${out}`;
rmSync(videoDir, { recursive: true, force: true });
console.log(`video: ${out}`);
