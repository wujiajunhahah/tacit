// One page as an asset: what the user read closely, their words, how they arrived, what Tacit did, the outline.

import { clip, type DeleteResponse, type LedgerEntry, type PageDetailResponse, type Visit } from '../../../core';
import { HttpError, del, get, query } from '../api';
import { arrival, stateLabel } from '../describe';
import { el, external, route, words } from '../dom';
import { ago, clock, date, day, duration, pct, t, tn, tx } from '../i18n';
import { confirmFlow, copyRow, cost, section } from '../parts';
import type { App, Rendered } from '../view';

type Moment = { text: string; at: number; kind: 'selected' | 'copied' };

/** Selections and copies across visits, newest first, each text once. */
function moments(visits: Visit[]): Moment[] {
  const all: Moment[] = visits.flatMap((v) => [
    ...v.selections.map((m) => ({ ...m, kind: 'selected' as const })),
    ...v.copies.map((m) => ({ ...m, kind: 'copied' as const })),
  ]);
  const seen = new Set<string>();
  return all
    .sort((a, b) => b.at - a.at)
    .filter((m) => {
      const k = m.text.trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function actionRow(e: LedgerEntry): HTMLElement {
  const detail: (Node | string)[] = [e.reason];
  if (e.confidence !== undefined) detail.push(' · ', el('span', 'meta', pct(e.confidence)));
  return el(
    'li',
    `entry state-${e.state}`,
    el('div', 'e-head', el('span', 'e-state', stateLabel(e.state)), el('time', 'meta', `${date(e.at)} ${clock(e.at)}`)),
    el('div', 'e-label', e.label),
    e.reason && el('div', 'e-reason', ...detail),
  );
}

export async function render(params: URLSearchParams, app: App): Promise<Rendered> {
  const url = params.get('url') ?? '';
  const root = el('div', 'detail', route(app.libraryHash || '#/library', `← ${t('page.back')}`, 'back'));
  let d: PageDetailResponse;
  try {
    d = await get<PageDetailResponse>(`/v1/page${query({ url })}`);
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 400)) {
      root.append(el('p', 'empty-body', t('page.missing')));
      return { node: root };
    }
    throw err;
  }
  const { page, summary, visits, reads, intent, packet, actions } = d;

  const title = el('h1', 'detail-title', page.title || page.url);
  title.tabIndex = -1;
  const facts = [
    tn('lib.visits', summary.visits),
    summary.dwellMs >= 1000 ? t('lib.read', { d: duration(summary.dwellMs) }) : '',
    t('page.first', { date: date(summary.firstSeen) }),
    t('page.last', { ago: ago(summary.lastSeen) }),
  ].filter(Boolean);
  root.append(
    title,
    el('p', 'detail-meta', external(page.url, `${page.domain} ↗`, '', t('common.open'))),
    el('p', 'facts meta', facts.join(' · ')),
  );
  if (intent.source !== 'none' && intent.text) root.append(el('p', 'after', ...tx('page.after', { intent: words(intent.text) })));

  root.append(copyRow(t('page.copy'), packet.markdown, cost(packet), t('now.copied')));
  // Deleting is always one click away but never competes with reading: it sits at the end.
  const remove = el('button', 'danger-quiet', t('page.delete'));
  remove.type = 'button';
  const confirm = el('div', 'confirm');
  const end = el('div', 'detail-end', remove, confirm);
  confirmFlow(remove, confirm, t('page.confirmText', { visits: tn('lib.visits', summary.visits) }), t('page.confirm'), async () => {
    await del<DeleteResponse>(`/v1/page${query({ url })}`);
    root.replaceChildren(
      route(app.libraryHash || '#/library', `← ${t('page.back')}`, 'back'),
      el('p', 'empty-title done', t('page.deleted')),
    );
    void app.refreshStatus();
  });

  root.append(
    section(
      t('page.reads'),
      reads.length
        ? el(
            'ol',
            'reads',
            ...reads.map((r) =>
              el(
                'li',
                '',
                el('p', 'read-text', clip(r.text, 600)),
                el('span', 'ms meta', `${duration(r.ms)} · ${t(r.via === 'pointer' ? 'page.viaPointer' : 'page.viaView')}`),
              ),
            ),
          )
        : el('p', 'quiet-note', t('page.readsEmpty')),
      reads.length > 0 && el('p', 'section-note', t('page.readsNote')),
    ),
  );

  const said = moments(visits);
  root.append(
    section(
      t('page.words'),
      said.length
        ? el(
            'div',
            'words',
            ...said.map((m) =>
              el(
                'figure',
                'said',
                el('blockquote', 'quote', words(clip(m.text, 600))),
                el('figcaption', 'quote-meta meta', `${t(m.kind === 'selected' ? 'page.selected' : 'page.copied')} · ${date(m.at)} ${clock(m.at)}`),
              ),
            ),
          )
        : el('p', 'quiet-note', t('page.wordsEmpty')),
    ),
  );

  root.append(
    section(
      t('page.arrivals'),
      el(
        'ol',
        'arrivals',
        ...visits.map((v) => {
          const how = arrival(v.arrival);
          return el('li', '', el('time', 'meta', `${day(v.startedAt)} ${clock(v.startedAt)}`), el('span', '', ...(how.length ? how : [t('arr.direct')])));
        }),
      ),
    ),
  );

  root.append(section(t('page.actions'), actions.length ? el('ol', 'entries', ...actions.map(actionRow)) : el('p', 'quiet-note', t('page.actionsEmpty'))));

  if (page.outline.length) {
    const top = Math.min(...page.outline.map((o) => o.level));
    root.append(
      section(
        t('page.outline'),
        el(
          'ol',
          'outline',
          ...page.outline.slice(0, 40).map((o) => {
            const li = el('li', '', clip(o.text, 90));
            li.style.setProperty('--depth', String(Math.min(4, o.level - top)));
            return li;
          }),
        ),
      ),
    );
  }
  root.append(end);
  return { node: root };
}
