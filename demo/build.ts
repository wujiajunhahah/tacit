// Stamps generated markup into the static Murmur pages: the shared columns from partials/
// and the initial feed posts rendered by assets/posts.js. The pages stay plain static HTML,
// so the feed fixture works without JavaScript. Run after editing posts.js or partials/:
//   bun run demo/build.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEMO = import.meta.dir;
const PUBLIC = join(DEMO, 'public');

/** Pages that carry `<!-- build:NAME -->…<!-- /build:NAME -->` blocks. */
export const BUILT_PAGES = ['feed.html', 'status.html', 'profile.html'];

export interface MurmurPost {
  id: string;
  user: string;
  topic: string;
  relevant: boolean;
  text: string;
}

export interface MurmurData {
  initial: MurmurPost[];
  more: MurmurPost[];
  people: Record<string, { name: string }>;
  batchSize: number;
  render(post: MurmurPost): string;
}

/** Loads assets/posts.js, which assigns `globalThis.Murmur`. */
export async function loadMurmur(): Promise<MurmurData> {
  await import(join(PUBLIC, 'assets', 'posts.js'));
  return (globalThis as unknown as { Murmur: MurmurData }).Murmur;
}

async function blocks(): Promise<Record<string, string>> {
  const murmur = await loadMurmur();
  return {
    nav: await readFile(join(DEMO, 'partials', 'murmur-nav.html'), 'utf8'),
    side: await readFile(join(DEMO, 'partials', 'murmur-side.html'), 'utf8'),
    posts: murmur.initial.map(murmur.render).join('\n') + '\n',
  };
}

/** Returns the page with every build block refilled from its source. */
export async function renderPage(html: string): Promise<string> {
  const content = await blocks();
  return html.replace(/(<!-- build:(\w+) -->\n)[\s\S]*?(<!-- \/build:\2 -->)/g, (whole, open: string, name: string, close: string) => {
    const fill = content[name];
    if (fill === undefined) throw new Error(`Unknown build block: ${name}`);
    return open + fill + close;
  });
}

/** Rewrites every built page in place. Returns the pages that changed. */
export async function build(): Promise<string[]> {
  const changed: string[] = [];
  for (const page of BUILT_PAGES) {
    const path = join(PUBLIC, page);
    const before = await readFile(path, 'utf8');
    const after = await renderPage(before);
    if (after !== before) {
      await writeFile(path, after);
      changed.push(page);
    }
  }
  return changed;
}

if (import.meta.main) {
  const changed = await build();
  console.log(changed.length ? `Updated ${changed.join(', ')}` : 'Pages already up to date');
}
