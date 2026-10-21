// Now: what the user seems to be doing, the evidence, the page, and the context ready for an agent.

import { clip, type CurrentContextResponse } from '../../../core';
import { get } from '../api';
import { arrival, evidence } from '../describe';
import { el, external, pageHash, route, words } from '../dom';
import { pct, t } from '../i18n';
import { copyRow, cost, emptyState, heading } from '../parts';
import type { Rendered } from '../view';

export const poll = true;

export async function render(): Promise<Rendered> {
  const ctx = await get<CurrentContextResponse>('/v1/context/current');
  const { intent, visit, packet } = ctx;
  const key = JSON.stringify([
    visit?.id,
    intent.text,
    Math.round(intent.confidence * 100),
    intent.evidence.map((e) => `${e.kind}:${e.text}`),
    packet?.tokens,
    Math.floor(Date.now() / 30_000),
  ]);
  const root = el('div', 'now', heading(t('now.title')));
  if (!visit) {
    root.append(emptyState(t('now.emptyTitle'), t('now.emptyBody')));
    return { node: root, key };
  }

  if (intent.source === 'none' || !intent.text) {
    root.append(el('p', 'intent is-quiet', t('intent.none')));
  } else {
    const source = t(intent.source === 'stated' ? 'intent.stated' : 'intent.inferred');
    root.append(el('p', 'intent', words(intent.text)), el('p', 'confidence meta', `${source} · ${pct(intent.confidence)}`));
    if (intent.evidence.length) root.append(el('ul', 'evidence', ...intent.evidence.slice(0, 4).map((ev) => el('li', '', ...evidence(ev)))));
    const others = intent.candidates.slice(1, 3).filter((c) => c.p >= 0.05);
    if (others.length) {
      const line = el('p', 'others', `${t('intent.others')}: `);
      others.forEach((c, i) => line.append(...(i ? [' · '] : []), words(clip(c.text, 48)), ` (${pct(c.p)})`));
      root.append(line);
    }
  }

  const how = arrival(visit.arrival);
  root.append(
    el(
      'div',
      'reading',
      el('p', 'kicker', t('now.reading')),
      el('p', 'reading-title', route(pageHash(visit.url), visit.title || visit.url), ' ', external(visit.url, '↗', 'out', t('common.open'))),
      el('p', 'reading-meta', visit.domain, ...(how.length ? [' · ', ...how] : [])),
    ),
  );
  root.append(packet ? copyRow(t('now.copy'), packet.markdown, cost(packet), t('now.copied')) : el('p', 'quiet-note', t('now.waiting')));
  return { node: root, key };
}
