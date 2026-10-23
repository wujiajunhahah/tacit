// Who decides, in words: the status line, the colophon, Privacy and Connect all say it the same way.

import type { DecisionsInfo, EngineInfo } from '../../core';
import { t } from './i18n';

export function nameOf(e: EngineInfo): string {
  if (e.id === 'local') return t('connect.code');
  return e.model ? `${e.label} (${e.model})` : e.label;
}

/** The first engine asked, for the status line. */
export function leadOf(d: DecisionsInfo | undefined): string {
  const lead = d?.chain[0];
  return !lead || lead.id === 'local' ? t('status.local') : nameOf(lead);
}

/** Where decision requests can go, e.g. "openrouter.ai"; empty when every one stays on this machine. */
export function hostsOf(d: DecisionsInfo | undefined): string {
  if (!d) return '';
  const engines = [...d.chain, ...(d.escalate ? [d.escalate] : [])];
  return [...new Set(engines.flatMap((e) => (e.host ? [e.host] : [])))].join(', ');
}
