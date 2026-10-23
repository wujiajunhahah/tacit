// Motion that says something changed, and nothing more: short, eased, and none at all when the system asks for less.

const EASE = 'cubic-bezier(.2, .8, .2, 1)';

function still(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** New words in the line rise into place. */
export function arrive(el: Element | null): void {
  if (!el || still()) return;
  el.animate([{ opacity: 0, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none' }], { duration: 170, easing: EASE });
}

/** The next step changed: the glyph breathes once. */
export function pulse(glyph: Element | null): void {
  if (!glyph || still()) return;
  glyph.animate(
    [{ transform: 'rotate(45deg) scale(1)' }, { transform: 'rotate(45deg) scale(1.7)', offset: 0.3 }, { transform: 'rotate(45deg) scale(1)' }],
    { duration: 460, easing: EASE },
  );
}

/** The slip opened: its rows come in one after another. */
export function stagger(rows: Iterable<Element>): void {
  if (still()) return;
  let i = 0;
  for (const row of rows) {
    row.animate([{ opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 180, delay: Math.min(i++, 6) * 26, easing: EASE, fill: 'backwards' });
  }
}
