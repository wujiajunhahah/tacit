// Bundles the extension into extension/dist and draws its icons. The same code also ships as a page
// script, dist/tacit-web.js, for the demo site and the browser tests; it is not part of the extension.

import { writeIcons } from './icons';

const root = new URL('..', import.meta.url).pathname;
const ext = `${root}extension`;
const common = { target: 'browser', format: 'iife', minify: false } as const;

const results = await Promise.all([
  Bun.build({ ...common, entrypoints: [`${ext}/src/content.ts`, `${ext}/src/background.ts`, `${ext}/src/popup.ts`], outdir: `${ext}/dist` }),
  Bun.build({ ...common, entrypoints: [`${ext}/src/tacit-web.ts`], outdir: `${root}dist` }),
]);

for (const result of results) {
  if (result.success) continue;
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await writeIcons(`${ext}/icons`);
for (const out of results.flatMap((r) => r.outputs)) console.log(`built ${out.path.replace(root, '')} (${(out.size / 1024).toFixed(1)} KB)`);
console.log('icons written to extension/icons');
