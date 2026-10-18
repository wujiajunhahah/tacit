// Launches Chromium with the Tacit extension loaded, for e2e runs and screenshots.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page, type Worker } from 'playwright';

export const ROOT = new URL('..', import.meta.url).pathname;
export const EXTENSION = join(ROOT, 'extension');

export interface TacitBrowser {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  close(): Promise<void>;
}

export async function launch(
  opts: { headless?: boolean; width?: number; height?: number; colorScheme?: 'light' | 'dark'; videoDir?: string } = {},
): Promise<TacitBrowser> {
  const profile = mkdtempSync(join(tmpdir(), 'tacit-profile-'));
  const width = opts.width ?? 1440;
  const height = opts.height ?? 900;
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: opts.headless ?? true,
    viewport: { width, height },
    deviceScaleFactor: opts.videoDir ? 1 : 2,
    recordVideo: opts.videoDir ? { dir: opts.videoDir, size: { width, height } } : undefined,
    colorScheme: opts.colorScheme ?? 'light',
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
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

export async function openSlip(page: Page): Promise<void> {
  await page.locator('tacit-capsule .line').hover();
  await page.waitForTimeout(350);
}
