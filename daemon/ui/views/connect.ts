// Connect: the exact commands for this machine, one click to copy, and which engine decides.

import type { ConnectResponse } from '../../../core';
import { get } from '../api';
import { el, quoted, words } from '../dom';
import { t, tx, type Key } from '../i18n';
import { copyRow, heading, section } from '../parts';
import type { Rendered } from '../view';

const TOOLS: [string, Key][] = [
  ['tacit_current_context', 'connect.tool.current'],
  ['tacit_intent', 'connect.tool.intent'],
  ['tacit_trail', 'connect.tool.trail'],
  ['tacit_search', 'connect.tool.search'],
  ['tacit_page', 'connect.tool.page'],
];

function snippet(text: string): HTMLElement {
  return el('pre', 'code', el('code', '', text));
}

export async function render(): Promise<Rendered> {
  const c = await get<ConnectResponse>('/v1/connect');
  const config = JSON.stringify(c.mcpConfig, null, 2);
  const root = el(
    'div',
    'connect',
    heading(t('connect.title')),
    el('p', 'lede', t('connect.intro')),
    section(
      t('connect.claude'),
      el('p', 'sentence', t('connect.claudeHow')),
      snippet(c.claudeCommand),
      copyRow(t('common.copy'), c.claudeCommand, '', t('common.copied'), false),
      el('p', 'sentence', ...tx('connect.try', { q: quoted(words(t('connect.tryQ'))) })),
    ),
    section(t('connect.other'), el('p', 'sentence', t('connect.otherHow')), snippet(config), copyRow(t('common.copy'), config, '', t('common.copied'), false)),
    section(t('connect.tools'), el('dl', 'tools', ...TOOLS.flatMap(([name, key]) => [el('dt', 'mono', name), el('dd', '', t(key))]))),
    section(t('connect.decisions'), el('p', 'sentence', c.engine === 'jev' ? t('connect.jev', { model: c.model ?? 'jev' }) : t('connect.local'))),
  );
  return { node: root };
}
