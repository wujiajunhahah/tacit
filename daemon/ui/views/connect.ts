// Connect: the exact commands for this machine, one click to copy, and which engine decides.

import type { ConnectResponse } from '../../../core';
import { get } from '../api';
import { nameOf } from '../decisions';
import { el, quoted, words } from '../dom';
import { t, tx, type Key, type Part } from '../i18n';
import { copyRow, heading, section } from '../parts';
import type { App, Rendered } from '../view';

const TOOLS: [string, Key][] = [
  ['tacit_current_context', 'connect.tool.current'],
  ['tacit_intent', 'connect.tool.intent'],
  ['tacit_trail', 'connect.tool.trail'],
  ['tacit_search', 'connect.tool.search'],
  ['tacit_page', 'connect.tool.page'],
];

/** The chain in sentences: who is asked, in what order, what is not asked and why, and where to change it. */
function decisions(c: ConnectResponse, app: App): HTMLElement[] {
  const d = c.decisions;
  const out: Part[][] = [];
  if (d.problem) out.push([t('connect.problem', { problem: d.problem })]);
  else if (d.chain.length > 1 || d.escalate) {
    out.push([t('connect.chain', { chain: d.chain.map(nameOf).join(' → ') })]);
    if (d.escalate) out.push([t('connect.escalate', { engine: nameOf(d.escalate) })]);
  } else if (d.privacy === 'cloud') out.push([t('connect.local')]);
  if (!d.problem && d.privacy === 'local') out.push([t('connect.kept')]);
  const ids = (reason: 'no-key' | 'privacy') => d.skipped.filter((s) => s.reason === reason).map((s) => s.id).join(', ');
  if (ids('no-key')) out.push([t('connect.noKey', { list: ids('no-key') })]);
  if (ids('privacy')) out.push([t('connect.private', { list: ids('privacy') })]);
  const last = app.health?.lastDecision;
  const by = last && [...d.chain, ...(d.escalate ? [d.escalate] : [])].find((e) => e.id === last.engine);
  if (last) out.push([t('connect.last', { engine: by ? nameOf(by) : last.engine, ms: String(last.latencyMs) })]);
  out.push(tx('connect.config', { path: el('code', 'mono', c.modelsFile) }));
  return out.map((parts) => el('p', 'sentence', ...parts));
}

function snippet(text: string): HTMLElement {
  return el('pre', 'code', el('code', '', text));
}

export async function render(_params: URLSearchParams, app: App): Promise<Rendered> {
  const c = await get<ConnectResponse>('/v1/connect');
  const config = JSON.stringify(c.mcpConfig, null, 2);
  const root = el(
    'div',
    'connect',
    heading(t('connect.title')),
    el('p', 'lede', t('connect.intro')),
    section(
      t('connect.any'),
      el('p', 'sentence', t('connect.anyHow')),
      snippet(c.agentLine),
      copyRow(t('common.copy'), c.agentLine, '', t('common.copied'), false),
      el('p', 'sentence', t('connect.hooks')),
    ),
    section(
      t('connect.claude'),
      el('p', 'sentence', t('connect.claudeHow')),
      snippet(c.claudeCommand),
      copyRow(t('common.copy'), c.claudeCommand, '', t('common.copied'), false),
      el('p', 'sentence', ...tx('connect.try', { q: quoted(words(t('connect.tryQ'))) })),
    ),
    section(t('connect.other'), el('p', 'sentence', t('connect.otherHow')), snippet(config), copyRow(t('common.copy'), config, '', t('common.copied'), false)),
    section(t('connect.tools'), el('dl', 'tools', ...TOOLS.flatMap(([name, key]) => [el('dt', 'mono', name), el('dd', '', t(key))]))),
    section(t('connect.decisions'), ...decisions(c, app)),
  );
  return { node: root };
}
