// Trail: visits newest first, grouped into sittings wherever nothing happened for ten minutes.

import { clip, type TrailItem, type Visit } from '../../../core';
import { get } from '../api';
import { arrival } from '../describe';
import { el, external, pageHash, route, words } from '../dom';
import { clock, day, duration, pct, t, tn } from '../i18n';
import { emptyState, heading } from '../parts';
import type { Rendered } from '../view';

export const poll = true;

const THREAD_GAP_MS = 10 * 60_000;

function threads(items: TrailItem[]): TrailItem[][] {
  const groups: TrailItem[][] = [];
  let newer: Visit | undefined;
  for (const item of items) {
    const v = item.visit;
    const lastActive = v.endedAt ?? v.startedAt + v.dwellMs;
    if (!newer || newer.startedAt - lastActive > THREAD_GAP_MS) groups.push([]);
    groups[groups.length - 1]?.push(item);
    newer = v;
  }
  return groups;
}

function visitRow(v: Visit, current: boolean): HTMLElement {
  const meta = [
    v.dwellMs >= 1000 ? t('trail.read', { d: duration(v.dwellMs) }) : '',
    v.maxScroll >= 0.05 ? t('trail.scrolled', { pct: pct(v.maxScroll) }) : '',
    v.copies.length ? tn('trail.copies', v.copies.length) : '',
  ].filter(Boolean);
  const how = arrival(v.arrival);
  return el(
    'li',
    current ? 'visit is-current' : 'visit',
    el('time', 'meta', current ? t('trail.now') : clock(v.startedAt)),
    el(
      'div',
      '',
      el('div', 'v-head', route(pageHash(v.url), v.title || v.url, 'v-title'), el('span', 'v-domain', v.domain), external(v.url, '↗', 'out', t('common.open'))),
      how.length > 0 && el('p', 'v-arrival', ...how),
      meta.length > 0 && el('p', 'v-meta meta', meta.join(' · ')),
      ...v.selections.slice(-2).map((s) => el('blockquote', 'quote', words(clip(s.text, 240)))),
    ),
  );
}

export async function render(): Promise<Rendered> {
  const items = await get<TrailItem[]>('/v1/trail?limit=80');
  const key = JSON.stringify([items.map((i) => [i.visit.id, i.visit.dwellMs, i.visit.selections.length]), Math.floor(Date.now() / 30_000)]);
  const root = el('div', 'trail', heading(t('trail.title')));
  if (items.length === 0) {
    root.append(emptyState(t('trail.emptyTitle'), t('trail.emptyBody')));
    return { node: root, key };
  }
  const currentId = items.find((i) => i.visit.endedAt === undefined)?.visit.id;
  for (const group of threads(items)) {
    const oldest = group[group.length - 1]!.visit;
    const newest = group[0]!.visit;
    const span = oldest === newest ? clock(oldest.startedAt) : `${clock(oldest.startedAt)}–${clock(newest.startedAt)}`;
    root.append(
      el(
        'div',
        'thread',
        el('div', 'thread-head meta', el('span', '', `${day(oldest.startedAt)} · ${span}`), el('span', '', tn('status.pages', group.length))),
        el('ol', 'visits', ...group.map((i) => visitRow(i.visit, i.visit.id === currentId))),
      ),
    );
  }
  return { node: root, key };
}
