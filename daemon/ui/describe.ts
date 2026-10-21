// Localized sentences built from structured data: evidence, arrivals, action states, calibration changes.

import { clip, domainOf, type ActionState, type Arrival, type CalibrationChange, type Evidence, type EvidenceKind } from '../../core';
import { el, quoted, words } from './dom';
import { ago, pct, t, tx } from './i18n';

type Part = Node | string;

/** Evidence the user typed or chose, set in their own typography; titles and labels are the page's words. */
const USER_WORDS = new Set<EvidenceKind>(['stated', 'search', 'copy', 'selection']);

export function evidence(ev: Evidence, now = Date.now()): Part[] {
  const text = clip(ev.text, 60);
  const shown = USER_WORDS.has(ev.kind) ? words(text) : text;
  return [t(`ev.${ev.kind}`), ' ', ...quoted(shown), el('span', 'when meta', ago(ev.at, now))];
}

function joinSteps(steps: (Part[] | false | null | undefined)[]): Part[] {
  const out: Part[] = [];
  for (const s of steps) {
    if (!s || s.length === 0) continue;
    if (out.length) out.push(' → ');
    out.push(...s);
  }
  return out;
}

/** How the user got to a page, in the dashboard's language. Empty when nothing is known. */
export function arrival(a: Arrival): Part[] {
  const from = (): Part[] | null =>
    a.fromTitle ? quoted(clip(a.fromTitle, 60)) : a.fromUrl ? [domainOf(a.fromUrl)] : null;
  const via = a.viaLabel ? tx('arr.via', { via: quoted(clip(a.viaLabel, 60)) }) : null;
  switch (a.kind) {
    case 'search': {
      const f = from();
      return joinSteps([tx('arr.search', { q: quoted(words(clip(a.searchQuery ?? '', 80))) }), f && tx('arr.on', { from: f }), via]);
    }
    case 'link': {
      const f = from();
      const steps = joinSteps([f && tx('arr.from', { from: f }), via]);
      return steps.length ? steps : [t('arr.link')];
    }
    case 'tacit': {
      const f = from();
      return joinSteps([f && tx('arr.from', { from: f }), [t('arr.tacit')]]);
    }
    case 'typed':
      return [t('arr.typed')];
    case 'bookmark':
      return [t('arr.bookmark')];
    case 'back_forward':
      return [t('arr.back')];
    case 'reload':
      return [t('arr.reload')];
    case 'new_tab': {
      const f = from();
      return f ? tx('arr.newTab', { from: f }) : [t('arr.newTabPlain')];
    }
    default:
      return [];
  }
}

export function stateLabel(state: ActionState): string {
  return t(`state.${state}`);
}

export function calibrationChange(c: CalibrationChange): string {
  if (c.kind === 'folds-off') return t('learned.foldsOff', { domain: c.domain, dismissed: c.dismissed, total: c.total });
  const vars = { from: pct(c.from), to: pct(c.to), undone: c.undone, kept: c.total - c.undone, total: c.total };
  return c.kind === 'act-raised' ? t('learned.actRaised', vars) : t('learned.actLowered', vars);
}
