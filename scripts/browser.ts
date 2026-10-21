// Launches Chromium with the Tacit extension loaded, for e2e runs and screenshots.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';

export const ROOT = new URL('..', import.meta.url).pathname;
export const EXTENSION = join(ROOT, 'extension');
/** Tests only talk to local servers; a system proxy that does not exempt loopback would swallow them. */
export const LOCAL_ONLY = ['--proxy-server=direct://', '--proxy-bypass-list=*'];

export interface TacitBrowser {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  close(): Promise<void>;
}

export async function launch(
  opts: { headless?: boolean; width?: number; height?: number; colorScheme?: 'light' | 'dark'; videoDir?: string; lang?: string } = {},
): Promise<TacitBrowser> {
  const profile = mkdtempSync(join(tmpdir(), 'tacit-profile-'));
  const width = opts.width ?? 1440;
  const height = opts.height ?? 900;
  // Tacit follows the browser's language; pin it, so runs do not depend on the machine.
  const lang = opts.lang ?? 'en-US';
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: opts.headless ?? true,
    viewport: { width, height },
    deviceScaleFactor: opts.videoDir ? 1 : 2,
    recordVideo: opts.videoDir ? { dir: opts.videoDir, size: { width, height } } : undefined,
    colorScheme: opts.colorScheme ?? 'light',
    locale: lang,
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [...LOCAL_ONLY, `--lang=${lang}`, `--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  return {
    context,
    worker,
    extensionId,
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/** Waits until Tacit's line is on screen and returns its text. */
export async function capsuleText(page: Page, timeout = 8000): Promise<string> {
  const line = page.locator('tacit-capsule .line');
  await line.waitFor({ state: 'visible', timeout });
  await page.waitForTimeout(250);
  return (await line.innerText()).replace(/\s+/g, ' ').trim();
}

/** Searches on the demo site, then opens a result: the way people arrive at a page. */
export async function searchThenOpen(page: Page, site: string, query: string, target: string): Promise<void> {
  await page.goto(`${site}/search.html?q=${encodeURIComponent(query).replace(/%20/g, '+')}`);
  await capsuleText(page);
  await page.locator(`a[href*="${target}"]:not([href*="#"])`).first().click();
  await page.waitForURL(new RegExp(target.replace('.', '\\.')));
}

export async function openSlip(page: Page): Promise<void> {
  await page.locator('tacit-capsule .line').hover();
  await page.waitForTimeout(350);
}
