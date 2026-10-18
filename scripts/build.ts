// Bundles the extension into extension/dist and draws its icons.

import { writeIcons } from './icons';

const root = new URL('..', import.meta.url).pathname;
const ext = `${root}extension`;

const result = await Bun.build({
  entrypoints: [`${ext}/src/content.ts`, `${ext}/src/background.ts`, `${ext}/src/popup.ts`],
  outdir: `${ext}/dist`,
  target: 'browser',
  format: 'iife',
  minify: false,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await writeIcons(`${ext}/icons`);
for (const out of result.outputs) console.log(`built ${out.path.replace(root, '')} (${(out.size / 1024).toFixed(1)} KB)`);
console.log('icons written to extension/icons');
