// Learned: what the feedback loop has tuned, from what the user kept and what they undid.

import type { CalibrationResponse } from '../../../core';
import { get } from '../api';
import { calibrationChange } from '../describe';
import { el } from '../dom';
import { pct, t, tn } from '../i18n';
import { heading, section } from '../parts';
import type { Rendered } from '../view';

export async function render(): Promise<Rendered> {
  const c = await get<CalibrationResponse>('/v1/calibration');
  const { executed, undone, keptFolds, dismissedFolds } = c.sample;
  const root = el(
    'div',
    'learned',
    heading(t('learned.title')),
    el('p', 'lede', t('learned.intro')),
    section(
      t('learned.when'),
      el('p', 'sentence', t('learned.act', { pct: pct(c.thresholds.act) })),
      el('p', 'sentence', t('learned.suggest', { pct: pct(c.thresholds.suggest) })),
    ),
    section(
      t('learned.changes'),
      c.changes.length
        ? el('ul', 'sentences', ...c.changes.map((change) => el('li', '', calibrationChange(change))))
        : el('p', 'quiet-note', t('learned.none')),
    ),
  );
  if (executed + undone + keptFolds + dismissedFolds > 0) {
    const vars = { actions: tn('learned.keptActions', executed), undone, folds: tn('learned.keptFolds', keptFolds), opened: dismissedFolds };
    root.append(el('p', 'section-note', t('learned.sample', vars)));
  }
  return { node: root };
}
