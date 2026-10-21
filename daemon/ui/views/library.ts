// Library: every recorded page as an asset. Search in any language, filter by site, order by recency or attention.

import type { PageSort, PageSummary, PagesResponse, StatsResponse } from '../../../core';
import { get, query } from '../api';
import { el, pageHash, quoted, route, words } from '../dom';
import { ago, duration, num, t, tn, tx, type Key } from '../i18n';
import { emptyState, heading } from '../parts';
import type { App, Rendered } from '../view';

const PAGE_SIZE = 30;
const SORTS_SEARCHING: PageSort[] = ['relevance', 'recent', 'attention'];
const SORTS_BROWSING: PageSort[] = ['recent', 'attention'];

function row(p: PageSummary): HTMLElement {
  const meta: (Node | string)[] = [p.domain, ' · ', ago(p.lastSeen)];
  if (p.dwellMs >= 1000) meta.push(' · ', t('lib.read', { d: duration(p.dwellMs) }));
  if (p.reads) meta.push(' · ', tn('lib.reads', p.reads));
  if (p.selections) meta.push(' · ', tn('lib.selections', p.selections));
  return el(
    'li',
    'row',
    el('p', 'row-title', route(pageHash(p.url), p.title || p.url)),
    el('p', 'row-meta', ...meta),
    p.snippet && el('p', 'row-snip', p.snippet),
  );
}

function option(value: string, text: string): HTMLOptionElement {
  const o = el('option', '', text);
  o.value = value;
  return o;
}

export async function render(params: URLSearchParams, app: App): Promise<Rendered> {
  const state = { q: params.get('q') ?? '', site: params.get('site') ?? '', sort: (params.get('sort') ?? '') as PageSort | '' };
  const hashOf = () => `#/library${query({ q: state.q, site: state.site, sort: state.sort || undefined })}`;
  app.libraryHash = hashOf();

  const stats = await get<StatsResponse>('/v1/stats');
  const root = el('div', 'library', heading(t('lib.title')));
  if (stats.pages === 0) {
    root.append(emptyState(t('lib.emptyTitle'), t('lib.emptyBody')));
    return { node: root };
  }

  const label = el('label', 'sr-only', t('lib.search'));
  label.htmlFor = 'q';
  const input = el('input', 'search-field');
  Object.assign(input, { id: 'q', type: 'search', value: state.q, placeholder: t('lib.placeholder'), autocomplete: 'off', spellcheck: false });
  const site = el('select', 'site', option('', t('lib.allSites')), ...stats.sites.map((s) => option(s.domain, `${s.domain} · ${num(s.pages)}`)));
  site.setAttribute('aria-label', t('lib.site'));
  site.value = state.site;
  const sorts = el('div', 'seg');
  sorts.setAttribute('role', 'group');
  sorts.setAttribute('aria-label', t('lib.sort'));
  const count = el('span', 'count meta');
  count.setAttribute('role', 'status');
  const list = el('ol', 'rows');
  const more = el('button', 'quiet more', t('lib.more'));
  more.type = 'button';
  more.hidden = true;
  root.append(label, input, el('div', 'toolbar', site, sorts, count, el('span', 'hint meta', t('common.hint'))), list, more);

  const searching = () => state.q.trim() !== '';
  const sortNow = (): PageSort => state.sort || (searching() ? 'relevance' : 'recent');
  let shown = 0;
  let seq = 0;

  const sync = () => {
    app.libraryHash = hashOf();
    history.replaceState(null, '', app.libraryHash);
  };

  const drawSorts = () =>
    sorts.replaceChildren(
      ...(searching() ? SORTS_SEARCHING : SORTS_BROWSING).map((s) => {
        const b = el('button', 'quiet', t(`lib.sort.${s}` as Key));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(sortNow() === s));
        b.addEventListener('click', () => {
          state.sort = s;
          sync();
          void load(true);
        });
        return b;
      }),
    );

  async function load(reset: boolean): Promise<void> {
    const mine = ++seq;
    const offset = reset ? 0 : shown;
    try {
      const res = await get<PagesResponse>(`/v1/pages${query({ q: state.q, site: state.site, sort: sortNow(), limit: PAGE_SIZE, offset })}`);
      if (mine !== seq) return;
      if (reset) list.replaceChildren();
      list.append(...res.pages.map(row));
      shown = offset + res.pages.length;
      count.textContent = searching() ? tn('lib.matches', res.total) : tn('lib.count', res.total);
      more.hidden = shown >= res.total;
      if (res.total === 0) {
        list.replaceChildren(el('li', 'row-empty', ...(searching() ? tx('lib.none', { q: quoted(words(state.q)) }) : [t('lib.noneSite')])));
      }
    } catch {
      if (mine === seq) count.textContent = t('common.error');
    }
    drawSorts();
  }

  let typing: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      state.q = input.value;
      if (!searching() && state.sort === 'relevance') state.sort = '';
      sync();
      void load(true);
    }, 220);
  });
  site.addEventListener('change', () => {
    state.site = site.value;
    sync();
    void load(true);
  });
  more.addEventListener('click', () => void load(false));

  await load(true);
  return { node: root };
}
