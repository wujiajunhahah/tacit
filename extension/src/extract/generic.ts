import { clip, domainOf, sameDocument, searchQueryOf, type Action, type Block, type BlockKind, type OutlineEntry, type PageKind, type PageModel } from '../../../core';
import { contextOf, flat, isOwn, isVisible, labelOf, regionOf } from './dom';

export interface Extracted {
  page: PageModel;
  /** Block and action ids mapped to the DOM elements on screen now. */
  elements: Map<string, Element>;
  feed: boolean;
  /** Feeds only: every post seen this visit, including ones the page has since recycled. */
  memory?: import('./feed').FeedMemory;
}

const ROOT_CANDIDATES = 'article, main, [role="main"], .markdown-body, #content, .content, .post, .entry-content, #main';
const BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,dd,figcaption';
const CHROME = 'header,footer,aside,[role="banner"],[role="contentinfo"],[role="complementary"]';
const MAX_BLOCKS = 400;
const MAX_ACTIONS = 300;

function textWeight(el: Element): number {
  let n = 0;
  el.querySelectorAll('p,li,pre,blockquote').forEach((p) => (n += p.textContent?.length ?? 0));
  return n;
}

/** The element holding the page's main text; the most specific one when candidates nest. */
export function findRoot(doc: Document): Element {
  const scored = [...doc.querySelectorAll(ROOT_CANDIDATES)]
    .filter((el) => !isOwn(el))
    .map((el) => ({ el, w: textWeight(el) }))
    .sort((a, b) => b.w - a.w);
  let best = scored[0];
  // A document still loading, or a redirect page, may have no body yet.
  if (!best || best.w < 400) return doc.body ?? doc.documentElement;
  for (;;) {
    const current: { el: Element; w: number } = best;
    const inner = scored.find((c) => c.el !== current.el && current.el.contains(c.el) && c.w >= 0.75 * current.w);
    if (!inner) break;
    best = inner;
  }
  return best.el;
}

/** Share of a block's text that is link text; lists of links are navigation, not content. */
function linkDensity(el: Element, textLength: number): number {
  let links = 0;
  el.querySelectorAll('a').forEach((a) => (links += flat(a.textContent).length));
  return textLength ? links / textLength : 0;
}

function kindOf(tag: string): BlockKind {
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'LI') return 'item';
  if (tag === 'PRE') return 'code';
  if (tag === 'BLOCKQUOTE') return 'quote';
  return 'para';
}

export function extractBlocks(root: Element): { blocks: Block[]; outline: OutlineEntry[]; elements: Map<string, Element> } {
  const blocks: Block[] = [];
  const outline: OutlineEntry[] = [];
  const elements = new Map<string, Element>();
  const isBody = root === root.ownerDocument?.body || root === root.ownerDocument?.documentElement;
  let section = '';
  let n = 0;
  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (blocks.length >= MAX_BLOCKS) break;
    if (isOwn(el) || el.closest('nav,[role="navigation"]')) continue;
    if (isBody && el.closest(CHROME)) continue;
    if (el.tagName !== 'PRE' && (el.querySelector(BLOCK_SELECTOR) || el.closest('pre'))) continue;
    const text = flat(el.textContent);
    if (text.length < 3 || !isVisible(el)) continue;
    const kind = kindOf(el.tagName);
    if (kind !== 'heading' && kind !== 'code' && linkDensity(el, text.length) > 0.75) continue;
    const id = `b${n++}`;
    if (kind === 'heading') {
      const level = Number(el.tagName[1]);
      section = clip(text, 120);
      outline.push({ level, text: section, blockId: id });
      blocks.push({ id, kind, level, text: section, section });
    } else {
      blocks.push({ id, kind, text: clip(text, 4000), section });
    }
    el.setAttribute('data-tacit-id', id);
    elements.set(id, el);
  }
  return { blocks, outline, elements };
}

/** "[Edit]", "edit" and "【编辑】" are one label. */
const labelKey = (label: string) => label.toLowerCase().replace(/[\[\]()（）【】]/g, '').trim();

/**
 * Labels that are page furniture, not content: short, and repeated for many different targets ("edit" beside every
 * section, "reply" under every comment, "share", "read more"). Suggesting one of them is never the next step.
 */
export function utilityLabels(labels: string[]): Set<string> {
  const count = new Map<string, number>();
  for (const key of labels.map(labelKey)) if (key.split(/\s+/).length <= 3) count.set(key, (count.get(key) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n >= 3).map(([k]) => k));
}

/** No letter in any script: a section number ("4.1"), a footnote mark ("[12]"), an arrow. Never a next step. */
export const wordless = (label: string) => !/\p{L}/u.test(label);

/**
 * A link that leaves you where you are is never a next step: the page marks it as the current one, or it points at
 * this same address. An in-page anchor to a section that exists still counts, since it moves you.
 */
export function staysPut(el: Element, href: string | undefined, pageUrl: string | undefined, doc: Document): boolean {
  const current = el.getAttribute('aria-current');
  if (current && current !== 'false') return true;
  if (!href || !sameDocument(href, pageUrl)) return false;
  let hash = '';
  try {
    hash = decodeURIComponent(new URL(href).hash.slice(1));
  } catch {
    return true;
  }
  return !hash || (!doc.getElementById(hash) && doc.getElementsByName(hash).length === 0);
}

export function extractActions(doc: Document, root: Element, elements: Map<string, Element>, prefix = 'a'): Action[] {
  const found: { el: Element; label: string; href?: string; isLink: boolean }[] = [];
  const seen = new Set<string>();
  const nodes = [...doc.querySelectorAll('a[href], button, [role="button"], input[type="submit"]')];
  const inMain = new Map(nodes.map((el) => [el, root.contains(el)]));
  nodes.sort((x, y) => Number(inMain.get(y)) - Number(inMain.get(x)));
  for (const el of nodes) {
    if (isOwn(el) || !isVisible(el)) continue;
    const isLink = el.tagName === 'A';
    const href = isLink ? (el as HTMLAnchorElement).href : undefined;
    if (isLink && (!href || href.startsWith('javascript:'))) continue;
    if (staysPut(el, href, doc.location?.href, doc)) continue;
    const label = labelOf(el);
    if (label.length < 2 || wordless(label)) continue;
    const key = `${label}|${href ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ el, label, href, isLink });
  }
  const furniture = utilityLabels(found.map((f) => f.label));
  const out: Action[] = [];
  for (const f of found) {
    if (out.length >= MAX_ACTIONS) break;
    if (furniture.has(labelKey(f.label))) continue;
    const id = `${prefix}${out.length}`;
    out.push({ id, kind: f.isLink ? 'link' : 'button', label: f.label, href: f.href, context: contextOf(f.el, f.label), region: regionOf(f.el, root) });
    elements.set(id, f.el);
  }
  return out;
}

/** Pages that are lists of links (news front pages, indexes): their prominent links are the content. */
function linkItems(root: Element, elements: Map<string, Element>, from: number): Block[] {
  const blocks: Block[] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll('a[href]')) {
    if (blocks.length >= 100) break;
    if (isOwn(a) || a.closest(`nav,[role="navigation"],${CHROME}`) || !isVisible(a)) continue;
    const text = flat(a.textContent);
    if (text.split(/\s+/).length < 3 || text.length < 15 || seen.has(text)) continue;
    seen.add(text);
    const id = `b${from + blocks.length}`;
    blocks.push({ id, kind: 'item', text: clip(text, 300), section: '' });
    a.setAttribute('data-tacit-id', id);
    elements.set(id, a);
  }
  return blocks;
}

const RESULT_TITLE = 'h2 a[href], h3 a[href], a[href] h2, a[href] h3';
const ADS = '.b_ad, #tads, #bottomads, [data-text-ad], [aria-label="Ads"], [aria-label="广告"]';

/**
 * A search engine's results, one block each, title and snippet: Bing, Google, Baidu and DuckDuckGo all mark a result
 * with a linked heading, but put the snippet in whatever element they like, so the reader looks for the heading and
 * then for the box that holds that one result and no other.
 */
export function searchResults(root: Element, elements: Map<string, Element>, from: number): Block[] {
  const titles = [...root.querySelectorAll(RESULT_TITLE)].map((el) => (el.tagName === 'A' ? el.closest('h2, h3') ?? el : el));
  const headings = [...new Set(titles)].filter((h) => !isOwn(h) && !h.closest(ADS) && isVisible(h));
  const blocks: Block[] = [];
  for (const heading of headings) {
    if (blocks.length >= 30) break;
    // Up to the largest box that holds this result and no other.
    let box: Element = heading;
    for (let up = box.parentElement; up && up !== root && headings.filter((h) => up!.contains(h)).length === 1; up = up.parentElement) box = up;
    const title = flat(heading.textContent);
    if (title.length < 4) continue;
    let snippet = '';
    for (const el of box.querySelectorAll('p, div, span')) {
      if (heading.contains(el) || el.contains(heading)) continue;
      const text = flat(el.textContent);
      if (text.length > snippet.length && text.length <= 600) snippet = text;
    }
    const id = `b${from + blocks.length}`;
    blocks.push({ id, kind: 'item', text: clip(snippet && !snippet.includes(title) ? `${title} — ${snippet}` : title, 300), section: '' });
    box.setAttribute('data-tacit-id', id);
    elements.set(id, box);
  }
  return blocks;
}

/** Commands in code blocks become one-keystroke copy actions. */
export function copyActions(blocks: Block[], elements: Map<string, Element>): Action[] {
  const out: Action[] = [];
  for (const b of blocks) {
    if (b.kind !== 'code' || out.length >= 20) continue;
    const raw = (elements.get(b.id)?.textContent ?? '').replace(/\r/g, '').trim();
    const lines = raw
      .split('\n')
      .map((l) => l.replace(/^\s*[$>]\s+/, '').trimEnd())
      .filter((l) => l.trim());
    const payload = lines.join('\n');
    const first = lines.find((l) => !/^\s*(#|\/\/)/.test(l)) ?? lines[0];
    if (!first || payload.length > 4000) continue;
    out.push({
      id: `copy:${b.id}`,
      kind: 'copy',
      label: `Copy “${clip(first.trim(), 44)}”`,
      context: clip(`${b.section} ${payload}`, 240),
      region: 'main',
      targetBlockId: b.id,
      payload,
    });
  }
  return out;
}

function metaDescription(doc: Document): string | undefined {
  const content = doc.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute('content');
  return content ? clip(flat(content), 400) : undefined;
}

const AUTH_PATH = /\/(log-?in|sign-?in|sign-?up|register|join|authwall|checkpoint|auth|oauth2?|sso)(?=\/|$|-|\.)/i;
// Not `\b`: it knows only ASCII, and 注册 would never match.
const AUTH_TITLE = /^(log ?in|sign ?in|sign ?up|join|register|create (an |your )?account|登录|登入|注册|註冊|登錄|ログイン|로그인)(?![\p{L}\p{N}])/iu;

/**
 * A page that asks for a password (a sign-in or sign-up page, an "authwall"): it is never read, like a site on the
 * never-read list. What it shows is a form, often with your name or email, never what you were looking for.
 */
export function isWall(doc: Document, page: PageModel): boolean {
  if (![...doc.querySelectorAll('input[type="password"]')].some(isVisible)) return false;
  let path = '';
  try {
    path = new URL(page.url).pathname;
  } catch {
    // An address that does not parse says nothing about sign-in.
  }
  return AUTH_PATH.test(path) || AUTH_TITLE.test(flat(page.title)) || page.blocks.filter((b) => b.kind !== 'heading').length < 8;
}

function pageKind(doc: Document, url: string, blocks: Block[], textLength: number): PageKind {
  if (searchQueryOf(url)) return 'search';
  if (doc.querySelector('.markdown-body')) return 'repo';
  const paras = blocks.filter((b) => b.kind === 'para').length;
  return textLength > 1500 && paras >= 5 ? 'article' : 'unknown';
}

export function clearIds(doc: Document): void {
  doc.querySelectorAll('[data-tacit-id]').forEach((el) => el.removeAttribute('data-tacit-id'));
}

export function extractGeneric(doc: Document, loc: Location): Extracted {
  clearIds(doc);
  // Nothing to read before the page has a body; a later read will find it, and an empty one replaces nothing.
  if (!doc.body) {
    const url = loc.href;
    const page: PageModel = { url, title: flat(doc.title) || url, domain: domainOf(url), kind: searchQueryOf(url) ? 'search' : 'unknown', blocks: [], actions: [], outline: [], textLength: 0 };
    return { page, elements: new Map(), feed: false };
  }
  const root = findRoot(doc);
  let { blocks, outline, elements } = extractBlocks(root);
  // On a search page the results are the content: one block each, title and snippet, wherever the engine put them.
  if (searchQueryOf(loc.href)) {
    clearIds(doc);
    const found = new Map<string, Element>();
    const results = searchResults(root, found, 0);
    // The results' titles are not an outline of anything, and the ones there point at blocks that are gone.
    if (results.length >= 3) [blocks, elements, outline] = [results, found, []];
    else {
      clearIds(doc);
      ({ blocks, outline, elements } = extractBlocks(root));
    }
  }
  if (blocks.filter((b) => b.kind !== 'heading').length < 5) blocks.push(...linkItems(root, elements, blocks.length));
  const actions = [...copyActions(blocks, elements), ...extractActions(doc, root, elements)];
  const textLength = blocks.reduce((n, b) => n + b.text.length, 0);
  const url = loc.href;
  const page: PageModel = {
    url,
    title: flat(doc.title) || url,
    domain: domainOf(url),
    lang: doc.documentElement.lang || undefined,
    description: metaDescription(doc),
    kind: pageKind(doc, url, blocks, textLength),
    blocks,
    actions,
    outline,
    textLength,
  };
  return { page, elements, feed: false };
}
