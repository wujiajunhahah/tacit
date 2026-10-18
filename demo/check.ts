// Checks the demo site's contracts against a live server and Chromium:
// HTTP behaviour, the article outline, the X-style feed markup, infinite scroll,
// the repo README, search results, and that nothing logs a console error.
//   bun run demo/check.ts
import { readFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { BUILT_PAGES, loadMurmur, renderPage } from './build';
import { startDemo } from './serve';

export const ARTICLE_SECTIONS: readonly (readonly [id: string, title: string])[] = [
  ['why-interfaces-got-old', 'Why interfaces got old'],
  ['the-page-is-context', 'The page is context'],
  ['system-one-decisions', 'System One decisions'],
  ['latency-why-400-ms-matters', 'Latency: why 400 ms matters'],
  ['the-context-ledger', 'The context ledger'],
  ['undo-is-a-promise', 'Undo is a promise'],
  ['six-people-in-every-conversation', 'Six people in every conversation'],
  ['folding-without-hiding', 'Folding without hiding'],
  ['from-browser-to-os', 'From browser to OS'],
  ['a-brief-history-of-the-mouse', 'A brief history of the mouse'],
  ['footnotes', 'Footnotes'],
];

export const README_SECTIONS = ['Overview', 'Install', 'Quick start', 'Usage', 'Configuration', 'Contributing', 'License'];

const INDEX_LINKS: [text: string, href: string][] = [
  ['Search "decision latency"', 'search.html?q=decision+latency'],
  ['Search "agent context copy paste"', 'search.html?q=agent+context+copy+paste'],
  ['Open the feed', 'feed.html'],
  ['Open a repo', 'repo.html'],
  ['Read the article', 'article.html'],
];

const RELATED_READING: [text: string, href: string][] = [
  ['Measuring decision latency in production', 'search.html?q=decision+latency+production'],
  ['Why agents need your browsing context', 'search.html?q=agent+context'],
  ['The Mother of All Demos, revisited', 'search.html?q=mouse+1968'],
];

const POST = 'article[data-testid="tweet"]';
const HOME_TIMELINE = 'main[role="main"] > div[aria-label="Timeline: Your Home Timeline"]';

let failures = 0;
const consoleErrors: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, got ${a}`);
}

async function check(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Sends a raw request line, bypassing URL normalisation in fetch. */
function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (data += chunk));
    socket.on('end', () => resolve({ status: Number(data.split(' ')[1]), body: data }));
    socket.on('error', reject);
  });
}

async function open(context: BrowserContext, url: string): Promise<Page> {
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(`${url}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${url}: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

/** Every post must match the X timeline markup contract exactly. Returns one line per violation. */
function postProblems(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate(
    ({ scope, selector }) => {
      const problems: string[] = [];
      document.querySelectorAll(`${scope} ${selector}`).forEach((post, i) => {
        const at = `post ${i}`;
        const attrs = Array.from(post.attributes).map((a) => `${a.name}=${a.value}`).join(' ');
        if (attrs !== 'data-testid=tweet role=article tabindex=0') problems.push(`${at}: attributes "${attrs}"`);
        const [name, text, group, extra] = Array.from(post.children);
        if (extra) problems.push(`${at}: more than three children`);
        if (name?.getAttribute('data-testid') !== 'User-Name') problems.push(`${at}: first child is not User-Name`);
        const profile = name?.querySelector(':scope > a[href^="profile.html?u="] > span');
        const handle = name?.querySelector(':scope > span');
        const time = name?.querySelector(':scope > a[href^="status.html?id="] > time[datetime]');
        if (!profile?.textContent || !handle?.textContent?.startsWith('@') || !time?.textContent) {
          problems.push(`${at}: User-Name needs profile link, @handle and status time`);
        }
        if (!/^.+ @\w+ · \S+$/.test(name?.textContent ?? '')) problems.push(`${at}: User-Name text "${name?.textContent}"`);
        if (text?.getAttribute('data-testid') !== 'tweetText' || text.getAttribute('lang') !== 'en' || !text.textContent?.trim()) {
          problems.push(`${at}: second child is not tweetText with lang=en`);
        }
        const buttons = Array.from(group?.children ?? []).map((b) => `${b.tagName}:${b.getAttribute('data-testid')}`).join(',');
        if (group?.getAttribute('role') !== 'group' || buttons !== 'BUTTON:reply,BUTTON:retweet,BUTTON:like') {
          problems.push(`${at}: third child is not the reply/retweet/like group`);
        }
      });
      return problems;
    },
    { scope, selector: POST },
  );
}

function countPosts(page: Page): Promise<number> {
  return page.locator(POST).count();
}

async function waitForPosts(page: Page, n: number): Promise<void> {
  await page.waitForFunction(({ selector, n }) => document.querySelectorAll(selector).length === n, { selector: POST, n }, { timeout: 3000 });
}

/** Scrolls so that the viewport bottom sits `gap` pixels above the end of the document. */
async function scrollToGap(page: Page, gap: number): Promise<void> {
  await page.evaluate((gap) => {
    window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight - gap);
  }, gap);
  await page.waitForTimeout(150);
}

async function main(): Promise<void> {
  const murmur = await loadMurmur();
  const demo = startDemo({ port: 0 });
  const base = demo.url;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  console.log(`Demo at ${base}\n`);

  try {
    await check('static pages are in sync with posts.js and partials/ (bun run demo/build.ts)', async () => {
      for (const name of BUILT_PAGES) {
        const html = await readFile(join(import.meta.dir, 'public', name), 'utf8');
        assert((await renderPage(html)) === html, `${name} is stale`);
      }
    });

    await check('every page and asset is served with 200 and its content type', async () => {
      const firstPost = murmur.initial[0];
      assert(firstPost, 'no posts');
      const expect: [string, string][] = [
        ['', 'text/html'],
        ['index.html', 'text/html'],
        ['search.html?q=decision+latency', 'text/html'],
        ['article.html', 'text/html'],
        ['feed.html', 'text/html'],
        [`status.html?id=${firstPost.id}`, 'text/html'],
        ['profile.html?u=mara_builds', 'text/html'],
        ['repo.html', 'text/html'],
        ['assets/base.css', 'text/css'],
        ['assets/posts.js', 'text/javascript'],
        ['assets/murmur.js', 'text/javascript'],
      ];
      for (const [path, type] of expect) {
        const res = await fetch(base + path);
        assert(res.status === 200, `/${path} returned ${res.status}`);
        assert(res.headers.get('content-type')?.startsWith(type), `/${path} has content type ${res.headers.get('content-type')}`);
      }
    });

    await check('unknown paths get the 404 page; directories are never listed', async () => {
      for (const path of ['archive.html', 'nope/deeper.html', 'assets/', 'assets', 'search']) {
        const res = await fetch(base + path);
        const body = await res.text();
        assert(res.status === 404, `/${path} returned ${res.status}`);
        assert(res.headers.get('content-type')?.startsWith('text/html'), `/${path} 404 is not HTML`);
        assert(body.includes('Not part of the demo'), `/${path} did not get the 404 page`);
      }
      const post = await fetch(base, { method: 'POST' });
      assert(post.status === 405, `POST / returned ${post.status}`);
    });

    await check('path traversal and dotfiles are refused', async () => {
      const attempts = ['/../serve.ts', '/%2e%2e/serve.ts', '/assets/..%2f..%2fserve.ts', '/..%2fbuild.ts', '/..%5cserve.ts', '/assets/%2e%2e/%2e%2e/check.ts', '/.hidden', '/%00index.html'];
      for (const path of attempts) {
        const { status, body } = await rawGet(demo.port, path);
        assert(status !== 200, `${path} returned 200`);
        assert(!/startDemo|renderPage|rawGet/.test(body), `${path} leaked source`);
      }
    });

    await check('bun run demo/serve.ts honours TACIT_DEMO_PORT', async () => {
      const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, 'serve.ts')], {
        env: { ...process.env, TACIT_DEMO_PORT: '0' },
        stdout: 'pipe',
      });
      try {
        const reader = proc.stdout.getReader();
        let out = '';
        while (!/http:\/\/127\.0\.0\.1:\d+\//.test(out)) {
          const { value, done } = await reader.read();
          if (done) break;
          out += new TextDecoder().decode(value);
        }
        const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(out)?.[0];
        assert(url, `no URL in output: ${out}`);
        assert((await fetch(url)).status === 200, 'entry point server did not serve index');
      } finally {
        proc.kill();
      }
    });

    await check('index links every demo flow', async () => {
      const page = await open(context, base);
      const links = await page.$$eval('a', (as) => as.map((a) => [a.textContent?.trim(), a.getAttribute('href')]));
      for (const [text, href] of INDEX_LINKS) {
        assert(links.some(([t, h]) => t === text && h === href), `missing link "${text}" → ${href}`);
      }
      await page.close();
    });

    await check('article: 11 h2 sections in order, 2–4 paragraphs of 60–140 words, ≥ 2,500 words', async () => {
      const page = await open(context, base + 'article.html');
      const info = await page.evaluate(() => {
        const article = document.querySelector('main > article');
        if (!article) return null;
        const words = (el: Element) => (el.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
        const sections = Array.from(article.querySelectorAll('h2')).map((h) => {
          const paras: number[] = [];
          for (let n = h.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
            if (n.tagName === 'P') paras.push(words(n));
          }
          return { id: h.id, title: h.textContent?.trim(), paras };
        });
        const texts = (selector: string) => Array.from(document.querySelectorAll(selector)).map((a) => a.textContent?.trim());
        return {
          h1: article.querySelector('h1')?.textContent?.trim(),
          author: article.querySelector('[rel="author"]')?.textContent?.trim(),
          date: article.querySelector('time[datetime]')?.getAttribute('datetime'),
          sections,
          pageH2: document.querySelectorAll('h2').length,
          links: Array.from(article.querySelectorAll('a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]),
          nav: texts('body > header nav a'),
          asideTitle: document.querySelector('body aside h3')?.textContent?.trim(),
          popular: document.querySelectorAll('body aside ul li a').length,
          footer: texts('body > footer a'),
          chromeInArticle: !!article.querySelector('header, nav, aside, footer'),
        };
      });
      assert(info, 'no main > article');
      same(info.h1, 'Notes on a context harness', 'h1');
      assert(info.author && info.date, 'byline or date missing');
      same(info.sections.map((s) => [s.id, s.title]), ARTICLE_SECTIONS, 'sections');
      same(info.pageH2, ARTICLE_SECTIONS.length, 'h2 elements on the page');
      for (const s of info.sections) {
        assert(s.paras.length >= 2 && s.paras.length <= 4, `#${s.id} has ${s.paras.length} paragraphs`);
        for (const n of s.paras) assert(n >= 60 && n <= 140, `#${s.id} has a ${n}-word paragraph`);
      }
      const words = info.sections.flatMap((s) => s.paras).reduce((a, b) => a + b, 0);
      assert(words >= 2500, `only ${words} words of prose`);
      for (const [text, href] of RELATED_READING) {
        assert(info.links.some(([t, h]) => t === text && h === href), `related reading "${text}" missing`);
      }
      same(info.nav, ['Home', 'Archive', 'About', 'Subscribe', 'Sign in'], 'site nav');
      same(info.asideTitle, 'Popular posts', 'aside title');
      same(info.popular, 3, 'popular posts');
      same(info.footer, ['Privacy', 'Terms', 'RSS'], 'footer links');
      assert(!info.chromeInArticle, 'site chrome is inside the article');
      console.log(`      ${words} words of prose`);
      await page.close();
    });

    await check('search: q=decision latency renders ranked results into the box and the page', async () => {
      const page = await open(context, base + 'search.html?q=decision+latency');
      const ids = new Set(ARTICLE_SECTIONS.map(([id]) => id));
      const info = await page.evaluate(() => ({
        value: document.querySelector<HTMLInputElement>('input[name="q"]')?.value,
        title: document.title,
        results: Array.from(document.querySelectorAll('.sk-result')).map((r) => ({
          title: r.querySelector('h3 a')?.textContent ?? '',
          href: r.querySelector('h3 a')?.getAttribute('href') ?? '',
          url: r.querySelector('cite')?.textContent ?? '',
          snippet: r.querySelector('.sk-snippet')?.textContent ?? '',
        })),
      }));
      same(info.value, 'decision latency', 'search box');
      assert(info.title.startsWith('decision latency'), `title "${info.title}"`);
      assert(info.results.length >= 6 && info.results.length <= 10, `${info.results.length} results`);
      for (const r of info.results) {
        assert(r.title && r.url && r.snippet, `incomplete result ${JSON.stringify(r)}`);
        const [path, hash] = r.href.split('#');
        assert(['article.html', 'feed.html', 'repo.html'].includes(path ?? ''), `result links to ${r.href}`);
        assert(hash === undefined || (path === 'article.html' && ids.has(hash)), `unknown section ${r.href}`);
      }
      assert(/latency/i.test(info.results[0]?.title ?? ''), `top result "${info.results[0]?.title}"`);
      const hrefs = info.results.map((r) => r.href);
      assert(hrefs.some((h) => h.startsWith('article.html#')), 'no section results');
      assert(hrefs.includes('feed.html') && hrefs.includes('repo.html'), 'feed and repo results missing');
      await page.close();
    });

    await check('search: other queries rank sensibly and the form reloads with the new q', async () => {
      const page = await open(context, base + 'search.html?q=agent+context+copy+paste');
      same(await page.locator('.sk-result h3 a').first().getAttribute('href'), 'feed.html', 'top result for agent context copy paste');
      await page.fill('header input[name="q"]', 'mouse 1968');
      await Promise.all([page.waitForURL(/q=mouse\+1968/), page.press('header input[name="q"]', 'Enter')]);
      same(await page.locator('.sk-result h3 a').first().textContent(), 'A brief history of the mouse', 'top result for mouse 1968');
      await page.goto(base + 'search.html');
      assert(await page.locator('.sk-home input[name="q"]').isVisible(), 'empty query should show the Seek home');
      await page.close();
    });

    await check('feed: ≥ 36 initial posts in the X markup, mixed topics, matching posts.js', async () => {
      const page = await open(context, base + 'feed.html');
      assert(await page.locator(HOME_TIMELINE).count(), 'timeline container missing');
      const n = await page.locator(`${HOME_TIMELINE} > ${POST}`).count();
      assert(n >= 36, `only ${n} posts`);
      same(await postProblems(page), [], 'markup problems');
      const domIds = await page.$$eval(`${POST} a[href^="status.html?id="]`, (as) => as.map((a) => a.getAttribute('href')?.slice('status.html?id='.length)));
      same(domIds, murmur.initial.map((p) => p.id), 'static posts vs posts.js');
      const agents = murmur.initial.filter((p) => p.topic === 'agents').length;
      const decisions = murmur.initial.filter((p) => p.topic === 'decisions').length;
      const noise = murmur.initial.filter((p) => !p.relevant).length;
      assert(agents >= 10 && decisions >= 6 && noise >= 20, `topics: ${agents} agents, ${decisions} decisions, ${noise} noise`);
      assert(!murmur.initial[0]?.relevant, 'feed opens with a relevant post');
      let run = 0;
      let longest = 0;
      for (const post of murmur.initial) {
        run = post.relevant ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      assert(longest <= 2, `${longest} relevant posts in a row`);
      for (const post of [...murmur.initial, ...murmur.more]) assert(murmur.people[post.user], `unknown author ${post.user}`);
      console.log(`      initial: ${n} posts = ${agents} agents/context, ${decisions} decisions/latency, ${noise} noise`);
      await page.close();
    });

    await check('feed: infinite scroll adds 12 posts within 600px of the bottom, three times, plus a button', async () => {
      const page = await open(context, base + 'feed.html');
      const start = await countPosts(page);
      await scrollToGap(page, 800);
      same(await countPosts(page), start, 'posts after scrolling to 800px from the bottom');
      await scrollToGap(page, 500);
      await waitForPosts(page, start + 12);
      await page.getByRole('button', { name: 'Show more posts' }).click();
      await waitForPosts(page, start + 24);
      await scrollToGap(page, 0);
      await waitForPosts(page, start + 36);
      assert(await page.getByText("You're all caught up.").isVisible(), 'caught-up message hidden');
      assert(!(await page.getByRole('button', { name: 'Show more posts' }).isVisible()), 'button still visible after three loads');
      await scrollToGap(page, 1500);
      await scrollToGap(page, 0);
      same(await countPosts(page), start + 36, 'posts after a fourth scroll');
      same(await postProblems(page), [], 'markup problems after loading');
      const ids = await page.$$eval(`${POST} a[href^="status.html?id="]`, (as) => as.map((a) => a.getAttribute('href')));
      same(new Set(ids).size, ids.length, 'unique status links');
      const topics = murmur.more.map((p) => (p.relevant ? p.topic : 'noise'));
      for (let i = 0; i < topics.length; i += murmur.batchSize) {
        const batch = topics.slice(i, i + murmur.batchSize);
        assert(new Set(batch).size === 3, `batch ${i / murmur.batchSize + 1} is not mixed`);
      }
      await page.close();
    });

    await check('status: one post by id with its replies, in the same markup', async () => {
      const focal = murmur.initial.find((p) => p.relevant);
      assert(focal, 'no relevant post');
      const page = await open(context, base + `status.html?id=${focal.id}`);
      const scope = 'main[role="main"] > div[aria-label="Timeline: Conversation"]';
      const n = await page.locator(`${scope} ${POST}`).count();
      assert(n >= 4, `${n} posts on the status page`);
      same(await postProblems(page, scope), [], 'markup problems');
      const text = await page.locator(`${scope} .m-focal [data-testid="tweetText"]`).textContent();
      same(text, focal.text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'), 'focal post text');
      const reply = page.locator(`${scope} > ${POST} a[href^="status.html?id="]`).first();
      await Promise.all([page.waitForURL(/status\.html\?id=18461/), reply.click()]);
      same(await page.locator(`${scope} ${POST}`).count(), 2, 'posts on a reply page (parent and reply)');
      await page.goto(base + 'status.html?id=0');
      assert(await page.getByText('This post doesn’t exist').isVisible(), 'missing post message');
      await page.close();
    });

    await check('profile: header and the person’s posts', async () => {
      const page = await open(context, base + 'profile.html?u=mara_builds');
      same(await page.locator('.m-profile h2').textContent(), 'Mara Lindqvist', 'profile name');
      const expected = [...murmur.initial, ...murmur.more].filter((p) => p.user === 'mara_builds').length;
      same(await page.locator(`main ${POST}`).count(), expected, 'profile posts');
      same(await postProblems(page), [], 'markup problems');
      await page.goto(base + 'profile.html?u=nobody');
      assert(await page.getByText('This account doesn’t exist').isVisible(), 'missing account message');
      await page.close();
    });

    await check('repo: tabs, file table, README sections, Code button reveals the clone command', async () => {
      const page = await open(context, base + 'repo.html');
      const info = await page.evaluate(() => {
        const readme = document.querySelector('article.markdown-body');
        const sections = Array.from(readme?.querySelectorAll('h2') ?? []).map((h) => {
          let code = false;
          for (let n = h.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling) {
            if (n.matches('pre') && n.querySelector(':scope > code')) code = true;
          }
          return { title: h.textContent?.trim(), code };
        });
        return {
          tabs: Array.from(document.querySelectorAll('.cy-tabs a')).map((a) => a.textContent?.replace(/\s+/g, ' ').trim()),
          files: Array.from(document.querySelectorAll('.cy-files tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.trim())),
          sections,
          about: document.querySelector('.cy-side')?.textContent?.includes('Calibrated reflexes for interfaces'),
        };
      });
      same(info.tabs, ['Code', 'Issues 12', 'Pull requests 3', 'Actions', 'Wiki'], 'tabs');
      same(info.files.map((row) => row[0]), ['src', 'test', 'docs', 'README.md', 'package.json', 'LICENSE'], 'files');
      assert(info.files.every((row) => row.length === 3 && row[1] && row[2]), 'every file needs a commit message and an age');
      same(info.sections.map((s) => s.title), README_SECTIONS, 'README sections');
      for (const name of ['Install', 'Quick start']) {
        assert(info.sections.find((s) => s.title === name)?.code, `${name} has no <pre><code>`);
      }
      assert(info.about, 'About sidebar missing');
      const clone = page.getByText('git clone https://example.com/tacit-labs/reflex.git', { exact: true });
      assert(!(await clone.isVisible()), 'clone command visible before clicking Code');
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      assert(await clone.isVisible(), 'clone command hidden after clicking Code');
      await page.keyboard.press('Escape');
      assert(!(await clone.isVisible()), 'Escape did not close the clone panel');
      await page.close();
    });

    await check('no console errors or uncaught exceptions on any page', async () => {
      const page = await open(context, base + 'nope.html');
      await page.close();
      same(consoleErrors, [], 'console errors');
    });
  } finally {
    await browser.close();
    await demo.stop();
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

if (import.meta.main) await main();
