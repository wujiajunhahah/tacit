// Marks Tacit leaves on the page itself: highlights, focus dimming, folded posts.

import { tn } from '../i18n';
import type { View } from '../view';

const STYLE_ID = 'tacit-page-style';
const MARKS = ['data-tacit-hl', 'data-tacit-dim', 'data-tacit-folded', 'data-tacit-fold-label', 'data-tacit-fold-tail', 'data-tacit-run', 'data-tacit-relevant'];

// Marks are ink in the margin, drawn in the page's own text color so they read on light and dark sites alike.
const PAGE_CSS = `
[data-tacit-hl] { position: relative !important; }
[data-tacit-hl]::before {
  content: "";
  position: absolute;
  left: -.95em;
  top: .32em;
  width: 2px;
  height: min(2.7em, calc(100% - .32em));
  background: currentColor;
  opacity: .82;
  border-radius: 1px;
  pointer-events: none;
  transform-origin: top;
  animation: tacit-ink .34s cubic-bezier(.2, .8, .2, 1) both;
}
li[data-tacit-hl]::before { left: -2.1em; }
[data-tacit-flash] { animation: tacit-flash 1.4s ease-out 1 !important; }
@keyframes tacit-flash {
  0% { background-color: rgba(128, 128, 136, .22); }
  100% { background-color: rgba(128, 128, 136, 0); }
}
/* Ink is drawn, top to bottom, the moment Tacit marks something; marks that stay are not drawn again. */
@keyframes tacit-ink { from { transform: scaleY(0); opacity: 0; } }
@keyframes tacit-fade { from { opacity: 0; } }
html[data-tacit-focus] [data-tacit-dim] { opacity: .2 !important; transition: opacity .2s ease !important; }
html[data-tacit-focus] [data-tacit-dim]:hover { opacity: 1 !important; }
[data-tacit-relevant] { position: relative !important; }
[data-tacit-relevant]::after {
  content: "";
  position: absolute;
  left: 6px;
  top: 14px;
  width: 2px;
  height: 2.6em;
  background: var(--tacit-ink, currentColor);
  opacity: .8;
  pointer-events: none;
  transform-origin: top;
  animation: tacit-ink .34s cubic-bezier(.2, .8, .2, 1) both;
}
[data-tacit-folded] { cursor: pointer !important; min-height: 0 !important; }
[data-tacit-folded] > * { display: none !important; }
[data-tacit-folded][data-tacit-fold-tail] { display: none !important; }
[data-tacit-folded]::before {
  content: attr(data-tacit-fold-label);
  display: block;
  padding: 6px 0;
  text-align: left;
  font: 11.5px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  color: rgba(120, 120, 128, .95);
  animation: tacit-fade .22s ease-out both;
}
[data-tacit-folded]:hover::before { text-decoration: underline; text-underline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  [data-tacit-flash], [data-tacit-hl]::before, [data-tacit-relevant]::after, [data-tacit-folded]::before { animation: none !important; }
}
`;

export function installPageStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAGE_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

export function clearMarks(doc: Document = document): void {
  doc.querySelectorAll(MARKS.map((m) => `[${m}]`).join(',')).forEach((el) => MARKS.forEach((m) => el.removeAttribute(m)));
}

function foldLabel(count: number): string {
  return tn('fold.one', 'fold.many', count);
}

/**
 * Marks the page as the view says. Only what changed is touched: a mark that stays keeps its ink, instead of being
 * drawn again on every update.
 */
export function applyMarks(view: View, elements: Map<string, Element>, doc: Document = document): void {
  const want = new Map<Element, Map<string, string>>();
  const mark = (el: Element | undefined, name: string, value = '') => {
    if (!el) return;
    const marks = want.get(el) ?? new Map<string, string>();
    marks.set(name, value);
    want.set(el, marks);
  };
  for (const id of view.highlights) mark(elements.get(id), 'data-tacit-hl');
  for (const id of view.dims) mark(elements.get(id), 'data-tacit-dim');
  for (const id of view.relevantPosts) mark(elements.get(id), 'data-tacit-relevant');
  // A virtual list may have recycled the start of a run; the label goes on the first post still on the page.
  view.foldRuns.forEach((run, r) => {
    run.flatMap((id) => elements.get(id) ?? []).forEach((el, i) => {
      mark(el, 'data-tacit-folded');
      mark(el, 'data-tacit-run', String(r));
      if (i === 0) mark(el, 'data-tacit-fold-label', foldLabel(run.length));
      else mark(el, 'data-tacit-fold-tail');
    });
  });
  doc.querySelectorAll(MARKS.map((m) => `[${m}]`).join(',')).forEach((el) => {
    const keep = want.get(el);
    for (const m of MARKS) if (!keep?.has(m)) el.removeAttribute(m);
  });
  for (const [el, marks] of want) for (const [name, value] of marks) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

export function flash(el: Element): void {
  el.removeAttribute('data-tacit-flash');
  void (el as HTMLElement).offsetWidth;
  el.setAttribute('data-tacit-flash', '');
  setTimeout(() => el.removeAttribute('data-tacit-flash'), 1300);
}

export function setFocus(on: boolean, doc: Document = document): void {
  doc.documentElement.toggleAttribute('data-tacit-focus', on);
}
