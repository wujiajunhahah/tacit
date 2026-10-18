// Captures 1440×900 screenshots of every demo page into demo/screenshots/.
//   bun run demo/screenshots.ts [name ...]
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { loadMurmur } from './build';
import { startDemo } from './serve';

const OUT = join(import.meta.dir, 'screenshots');

interface Shot {
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<void>;
}

async function shots(): Promise<Shot[]> {
  const murmur = await loadMurmur();
  const focal = murmur.initial.find((post) => post.user === 'theo_ships') ?? murmur.initial[0];
  return [
    { name: 'index', path: '' },
    { name: 'search', path: 'search.html?q=decision+latency' },
    { name: 'search-agent-context', path: 'search.html?q=agent+context+copy+paste' },
    { name: 'search-home', path: 'search.html' },
    { name: 'article', path: 'article.html' },
    { name: 'article-section', path: 'article.html#latency-why-400-ms-matters' },
    { name: 'feed', path: 'feed.html' },
    { name: 'status', path: `status.html?id=${focal?.id ?? ''}` },
    { name: 'profile', path: 'profile.html?u=mara_builds' },
    { name: 'repo', path: 'repo.html' },
    { name: 'repo-clone', path: 'repo.html', prepare: (page) => page.getByRole('button', { name: 'Code' }).click() },
    { name: 'not-found', path: 'archive.html' },
  ];
}

if (import.meta.main) {
  const only = new Set(process.argv.slice(2));
  const demo = startDemo({ port: 0 });
  const browser = await chromium.launch();
  try {
    await mkdir(OUT, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const shot of await shots()) {
      if (only.size && !only.has(shot.name)) continue;
      await page.goto(demo.url + shot.path, { waitUntil: 'load' });
      await shot.prepare?.(page);
      const file = join(OUT, `${shot.name}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
  } finally {
    await browser.close();
    await demo.stop();
  }
}
