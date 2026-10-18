import { clip, type Region } from '../../../core';

export const HOST_TAG = 'tacit-capsule';

export function flat(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

export function isVisible(el: Element): boolean {
  const h = el as HTMLElement & { checkVisibility?: (o?: object) => boolean };
  if (typeof h.checkVisibility === 'function') return h.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

export function isOwn(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest(HOST_TAG);
}

export function regionOf(el: Element, root: Element): Region {
  if (el.closest('nav,[role="navigation"]')) return 'nav';
  if (el.closest('footer,[role="contentinfo"]')) return 'footer';
  if (el.closest('aside,[role="complementary"]')) return 'aside';
  if (root !== el.ownerDocument.body && root.contains(el)) return 'main';
  if (el.closest('header,[role="banner"]')) return 'header';
  return root.contains(el) ? 'main' : 'unknown';
}

export function labelOf(el: Element): string {
  const text = flat((el as HTMLElement).innerText ?? el.textContent);
  const fallback = el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLInputElement).value || '';
  return clip(text || flat(fallback), 120);
}

export function contextOf(el: Element, label: string): string {
  const holder = el.closest('p,li,td,blockquote,figcaption,h1,h2,h3,h4,h5,h6,article,section') ?? el.parentElement;
  const text = flat(holder?.textContent).replace(label, '').trim();
  return clip(text, 220);
}

export function normalizeUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch {
    return href;
  }
}
