import { clip, domainOf, type Action, type Block } from '../../../core';
import { flat } from './dom';
import { clearIds, extractActions, type Extracted } from './generic';

/** A post on an X-style timeline. */
export const POST = 'article[data-testid="tweet"]';
const MAX_POSTS = 400;

/**
 * Timelines like X recycle the DOM of posts that scroll away. The memory keeps every post the user
 * scrolled past, in the order they first appeared, so the whole session is context, not just the screen.
 */
export interface FeedMemory {
  posts: Map<string, { block: Block; jump: Action; order: number }>;
  chrome?: Action[];
  next: number;
}

export function newFeedMemory(): FeedMemory {
  return { posts: new Map(), next: 0 };
}

export function isFeed(doc: Document, loc: Location): boolean {
  return doc.querySelectorAll(POST).length >= 3 || /(^|\.)(x|twitter)\.com$/.test(loc.hostname);
}

function statusId(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return (href.match(/status\/(\d+)/) ?? href.match(/[?&]id=([\w-]+)/))?.[1];
}

/** Stable id for a post without a permalink, so recycling the DOM does not change it. */
function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

/** Margin marks use the post's own text color, so they read on light and dark themes alike. */
function rememberInk(el: Element, textEl: Element | null): void {
  const style = (el as HTMLElement).style;
  if (!textEl || !style || style.getPropertyValue('--tacit-ink')) return;
  style.setProperty('--tacit-ink', getComputedStyle(textEl).color);
}

/** Posts on an X-style timeline become 'item' blocks; each gets a jump action. */
export function extractFeed(doc: Document, loc: Location, memory: FeedMemory = newFeedMemory()): Extracted {
  clearIds(doc);
  const elements = new Map<string, Element>();

  doc.querySelectorAll(POST).forEach((el) => {
    const textEl = el.querySelector('[data-testid="tweetText"]');
    const text = flat(textEl?.textContent);
    const author = flat(el.querySelector('[data-testid="User-Name"]')?.textContent).replace(/·.*$/, '').trim();
    if (!text && !author) return;
    const link = el.querySelector<HTMLAnchorElement>('a[href*="status"]');
    const sid = statusId(link?.href) ?? hashId(`${author}\n${text}`);
    const id = `p:${sid}`;
    el.setAttribute('data-tacit-id', id);
    elements.set(id, el);
    rememberInk(el, textEl);
    if (memory.posts.has(sid)) return;
    const handle = author.match(/@[\w.]+/)?.[0] ?? author;
    memory.posts.set(sid, {
      order: memory.next++,
      block: { id, kind: 'item', text: text || author, section: clip(author, 80) },
      jump: { id: `jump:${id}`, kind: 'jump', label: `${handle}: ${clip(text, 64)}`, href: link?.href, context: clip(text, 220), region: 'main', targetBlockId: id },
    });
  });

  if (memory.posts.size > MAX_POSTS) {
    const oldest = [...memory.posts.entries()].sort((a, b) => a[1].order - b[1].order).slice(0, memory.posts.size - MAX_POSTS);
    for (const [sid] of oldest) memory.posts.delete(sid);
  }
  const posts = [...memory.posts.values()].sort((a, b) => a.order - b.order);

  if (!memory.chrome) {
    const root = doc.querySelector('main, [role="main"]') ?? doc.body;
    memory.chrome = extractActions(doc, root, elements, 'a').filter((a) => a.region !== 'main');
  }
  const url = loc.href;
  return {
    page: {
      url,
      title: flat(doc.title) || url,
      domain: domainOf(url),
      kind: 'feed',
      blocks: posts.map((p) => p.block),
      actions: [...posts.map((p) => p.jump), ...memory.chrome],
      outline: [],
      textLength: posts.reduce((n, p) => n + p.block.text.length, 0),
    },
    elements,
    feed: true,
    memory,
  };
}
