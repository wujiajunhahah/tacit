// DOM helpers for the dashboard. Page-derived text always goes in as text, never as HTML.

export type Child = Node | string | false | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const c of children) if (c) node.append(c);
  return node;
}

export function attrs<T extends HTMLElement>(node: T, values: Record<string, string>): T {
  for (const [k, v] of Object.entries(values)) node.setAttribute(k, v);
  return node;
}

/** A link inside the dashboard, e.g. `#/page?url=…`. */
export function route(hash: string, text: Child, cls = ''): HTMLAnchorElement {
  const a = el('a', cls, text);
  a.href = hash;
  return a;
}

/** A link out to the page itself; only http(s), so a recorded `javascript:` URL can never run. */
export function external(url: string, text: Child, cls = '', label?: string): HTMLElement {
  if (!/^https?:\/\//i.test(url)) return el('span', cls, text);
  const a = el('a', cls, text);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noreferrer noopener';
  if (label) a.setAttribute('aria-label', label);
  return a;
}

export function pageHash(url: string): string {
  return `#/page?url=${encodeURIComponent(url)}`;
}

const HAN = /[㐀-鿿豈-﫿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯]/;

/** The user's own words: italic serif, or upright serif for CJK, which has no true italics. */
export function words(text: string, cls = ''): HTMLSpanElement {
  const span = el('span', `you ${cls}`.trim(), text);
  const lang = KANA.test(text) ? 'ja' : HANGUL.test(text) ? 'ko' : HAN.test(text) ? 'zh' : '';
  if (lang) {
    span.classList.add('cjk');
    span.lang = lang;
  }
  return span;
}

export function quoted(content: Child): Node[] {
  return ['“', content || '', '”'].filter((c): c is Node | string => c !== '').map((c) => (typeof c === 'string' ? document.createTextNode(c) : c));
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
