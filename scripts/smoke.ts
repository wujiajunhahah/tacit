// Quick real-web smoke test: does Tacit start, extract and render without errors?

import { capsuleText, launch, openSlip, ROOT } from './browser';

const out = `${ROOT}docs/screenshots`;
const b = await launch();
const errors: string[] = [];
b.worker.on('console', (m) => m.type() === 'error' && errors.push(`[worker] ${m.text()}`));
const page = await b.context.newPage();
page.on('pageerror', (e) => errors.push(`[page] ${e.message}`));
page.on('console', (m) => m.text().includes('[tacit]') && errors.push(`[content] ${m.text()}`));

const url = process.argv[2] ?? 'https://en.wikipedia.org/wiki/Human%E2%80%93computer_interaction';
await page.goto(url, { waitUntil: 'domcontentloaded' });
console.log('line:', await capsuleText(page, 15000));
const stats = await page.evaluate(() => ({
  blocks: document.querySelectorAll('[data-tacit-id]').length,
  highlights: document.querySelectorAll('[data-tacit-hl]').length,
}));
console.log('stats:', stats);
await openSlip(page);
await page.screenshot({ path: `${out}/smoke.png` });
console.log('slip:', (await page.locator('tacit-capsule .tc').innerText()).replace(/\s+/g, ' ').slice(0, 400));
console.log(errors.length ? errors.join('\n') : 'no errors');
await b.close();
