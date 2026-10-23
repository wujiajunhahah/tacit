// Privacy: where everything lives, how much there is, and one way to delete all of it.

import type { DeleteResponse, StatsResponse } from '../../../core';
import { CONFIRM_DELETE_ALL, CONFIRM_HEADER } from '../../guard';
import { del, get } from '../api';
import { hostsOf } from '../decisions';
import { el, external } from '../dom';
import { bytes, t, tn, tx } from '../i18n';
import { confirmFlow, heading } from '../parts';
import type { App, Rendered } from '../view';

const POLICY = 'https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md';

export async function render(_params: URLSearchParams, app: App): Promise<Rendered> {
  const s = await get<StatsResponse>('/v1/stats');
  const hosts = hostsOf(app.health?.decisions);
  const root = el(
    'div',
    'privacy',
    heading(t('privacy.title')),
    el(
      'p',
      'lede',
      ...tx('privacy.where', { path: el('code', 'mono', s.storage.display), size: bytes(s.storage.bytes) }),
      ' ',
      hosts ? t('privacy.cloud', { hosts }) : t('privacy.local'),
    ),
  );
  const counts = {
    pages: tn('status.pages', s.pages),
    visits: tn('lib.visits', s.visits),
    actions: tn('privacy.actions', s.actions),
  };
  const empty = s.pages + s.visits + s.actions === 0;
  root.append(el('p', 'sentence', empty ? t('privacy.empty') : t('privacy.counts', counts)), el('p', 'sentence', t('privacy.extension')));

  if (!empty) {
    const open = el('button', 'danger', t('privacy.delete'));
    open.type = 'button';
    const confirm = el('div', 'confirm');
    root.append(el('div', 'handoff', open), confirm);
    confirmFlow(open, confirm, t('privacy.confirmText', counts), t('privacy.confirm'), async () => {
      await del<DeleteResponse>('/v1/all', { [CONFIRM_HEADER]: CONFIRM_DELETE_ALL });
      confirm.replaceChildren(el('p', 'confirm-text done', t('privacy.done')));
      void app.refreshStatus();
    });
  }
  root.append(el('p', 'section-note', external(POLICY, `${t('privacy.policy')} ↗`)));
  return { node: root };
}
