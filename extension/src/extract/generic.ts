import { clip, domainOf, searchQueryOf, type Action, type Block, type BlockKind, type OutlineEntry, type PageKind, type PageModel } from '../../../core';
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
  if (!best || best.w < 400) return doc.body;
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
  const isBody = root === root.ownerDocument.body;
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

export function extractActions(doc: Document, root: Element, elements: Map<string, Element>, prefix = 'a'): Action[] {
  const out: Action[] = [];
  const seen = new Set<string>();
  const nodes = [...doc.querySelectorAll('a[href], button, [role="button"], input[type="submit"]')];
  const inMain = new Map(nodes.map((el) => [el, root.contains(el)]));
  nodes.sort((x, y) => Number(inMain.get(y)) - Number(inMain.get(x)));
  let n = 0;
  for (const el of nodes) {
    if (out.length >= MAX_ACTIONS) break;
    if (isOwn(el) || !isVisible(el)) continue;
    const isLink = el.tagName === 'A';
    const href = isLink ? (el as HTMLAnchorElement).href : undefined;
    if (isLink && (!href || href.startsWith('javascript:'))) continue;
    const label = labelOf(el);
    if (label.length < 2) continue;
    const key = `${label}|${href ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const id = `${prefix}${n++}`;
    out.push({ id, kind: isLink ? 'link' : 'button', label, href, context: contextOf(el, label), region: regionOf(el, root) });
    elements.set(id, el);
  }
  return out;
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
  const root = findRoot(doc);
  const { blocks, outline, elements } = extractBlocks(root);
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
