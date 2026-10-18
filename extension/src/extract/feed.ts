import { clip, domainOf, type Action, type Block } from '../../../core';
import { flat } from './dom';
import { clearIds, extractActions, type Extracted } from './generic';

const POST = 'article[data-testid="tweet"]';
const MAX_POSTS = 400;

export function isFeed(doc: Document, loc: Location): boolean {
  return doc.querySelectorAll(POST).length >= 3 || /(^|\.)(x|twitter)\.com$/.test(loc.hostname);
}

function statusId(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return (href.match(/status\/(\d+)/) ?? href.match(/[?&]id=([\w-]+)/))?.[1];
}

/** Posts on an X-style timeline become 'item' blocks; each gets a jump action. */
export function extractFeed(doc: Document, loc: Location): Extracted {
  clearIds(doc);
  const elements = new Map<string, Element>();
  const blocks: Block[] = [];
  const jumps: Action[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll(POST).forEach((el, i) => {
    if (blocks.length >= MAX_POSTS) return;
    const text = flat(el.querySelector('[data-testid="tweetText"]')?.textContent);
    const author = flat(el.querySelector('[data-testid="User-Name"]')?.textContent).replace(/·.*$/, '').trim();
    const link = el.querySelector<HTMLAnchorElement>('a[href*="status"]');
    const sid = statusId(link?.href) ?? `i${i}`;
    if (seen.has(sid)) return;
    seen.add(sid);
    const id = `p:${sid}`;
    blocks.push({ id, kind: 'item', text: text || author, section: clip(author, 80) });
    el.setAttribute('data-tacit-id', id);
    elements.set(id, el);
    const handle = author.match(/@[\w.]+/)?.[0] ?? author;
    jumps.push({
      id: `jump:${id}`,
      kind: 'jump',
      label: `${handle}: ${clip(text, 64)}`,
      href: link?.href,
      context: clip(text, 220),
      region: 'main',
      targetBlockId: id,
    });
  });

  const root = doc.querySelector('main, [role="main"]') ?? doc.body;
  const chrome = extractActions(doc, root, elements, 'a').filter((a) => a.region !== 'main');
  const url = loc.href;
  return {
    page: {
      url,
      title: flat(doc.title) || url,
      domain: domainOf(url),
      kind: 'feed',
      blocks,
      actions: [...jumps, ...chrome],
      outline: [],
      textLength: blocks.reduce((n, b) => n + b.text.length, 0),
    },
    elements,
    feed: true,
  };
}
