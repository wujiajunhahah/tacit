// The ledger as plain text for agents: what the MCP tools return.

import {
  ago,
  clip,
  describeArrival,
  describeEvidence,
  distinctReads,
  type Block,
  type CurrentContextResponse,
  type Intent,
  type PageKind,
  type PageResponse,
  type SearchHit,
  type TrailItem,
  type Visit,
} from '../core';
import { readPassages } from './library';
import { duration, pct, plural } from './units';

/** How the reader asks for more: through MCP tools, or the `tacit` command. */
export type Port = 'mcp' | 'cli';

const MORE: Record<Port, { trail: string; page: (chars: number) => string; full: string; search: string }> = {
  mcp: { trail: 'tacit_trail', page: () => 'call tacit_page with a larger max_chars for more', full: 'tacit_current_context', search: 'tacit_search' },
  cli: { trail: '`tacit trail`', page: (chars) => `run \`tacit page <url> --chars ${chars * 2}\` for more`, full: '`tacit now --full`', search: '`tacit search <words>`' },
};

/** When the user was last active on the visit Tacit thinks is current. */
export function lastActive(ctx: Pick<CurrentContextResponse, 'visit' | 'activeAt'>): number {
  const v = ctx.visit;
  if (!v) return 0;
  return Math.max(ctx.activeAt ?? 0, v.endedAt ?? 0, v.startedAt, ...v.selections.map((s) => s.at), ...(v.reads ?? []).map((r) => r.at));
}

/** Below this, a guess about what the user is after would mislead an agent more than help it. */
const SURE_ENOUGH = 0.35;

/**
 * The few lines an agent gets about the user's screen, about 100 tokens: where they are, what they seem to be after,
 * how they got there, what they selected and read closely, and where to get more. Everything else waits until asked.
 */
export function formatBrief(ctx: CurrentContextResponse, now = Date.now(), port: Port = 'cli'): string {
  const v = ctx.visit;
  if (!v) return EMPTY_LEDGER;
  const active = lastActive(ctx);
  const when = now - active < 2 * 60_000 ? 'now' : ago(now - active);
  const lines = [`The user's browser (${when}): “${clip(v.title || v.url, 90)}” ${v.url}`];
  const i = ctx.intent;
  if (i.source === 'stated' || (i.source !== 'none' && i.text && i.confidence >= SURE_ENOUGH)) {
    lines.push(`They seem to be after: ${clip(i.text, 80)} (${i.source === 'stated' ? 'they said so' : pct(i.confidence)}).`);
  }
  const arrival = describeArrival(v);
  if (arrival) lines.push(`They got there: ${arrival}.`);
  const selected = v.selections.at(-1);
  if (selected) lines.push(`Selected: “${clip(selected.text, 120)}”`);
  const read = distinctReads(v.reads ?? []).sort((a, b) => b.ms - a.ms)[0];
  if (read) lines.push(`Read closely: “${clip(read.text, 140)}”`);
  lines.push(`More: ${MORE[port].full} for this page as context, ${MORE[port].search} for what they read before.`);
  return lines.join('\n');
}

export const EMPTY_LEDGER =
  'Tacit has not recorded any browsing yet: ask the user to install the Tacit browser extension and open a page (everything stays on their machine).';

export function formatContext(ctx: CurrentContextResponse): string {
  if (ctx.packet) return ctx.packet.markdown;
  if (!ctx.visit) return EMPTY_LEDGER;
  const v = ctx.visit;
  return [
    `The user is on “${v.title || v.url}” (${v.url}), but Tacit has not captured the text of this page yet.`,
    '',
    formatIntent(ctx.intent),
  ].join('\n');
}

export function formatIntent(intent: Intent, now = Date.now()): string {
  if (intent.source === 'none' || !intent.text) {
    return 'Tacit cannot tell what the user is trying to do yet: no recent search, selection, copy or long read to go on.';
  }
  const how = intent.source === 'stated' ? 'stated by the user' : 'inferred from what they did';
  const lines = [`Intent: ${intent.text}`, `Confidence: ${pct(intent.confidence)} (${how})`];
  const terms = Object.keys(intent.terms).slice(0, 8);
  if (terms.length) lines.push(`Key terms: ${terms.join(', ')}`);
  if (intent.evidence.length) lines.push('', 'Evidence:', ...intent.evidence.map((ev) => `- ${describeEvidence(ev, now)}`));
  const others = intent.candidates.slice(1);
  if (others.length) lines.push('', 'Other readings:', ...others.map((c) => `- ${c.text} (${pct(c.p)})`));
  return lines.join('\n');
}

export function formatTrail(items: TrailItem[], now = Date.now()): string {
  if (items.length === 0) return EMPTY_LEDGER;
  const lines = [`The user's last ${plural(items.length, 'page visit', 'page visits')}, newest first:`];
  items.forEach(({ visit: v, arrival }, i) => {
    const facts = [v.domain, ago(now - v.startedAt), v.dwellMs >= 1000 ? `read ${duration(v.dwellMs)}` : ''];
    lines.push('', `${i + 1}. ${v.title || v.url} (${facts.filter(Boolean).join(' · ')})`, `   ${v.url}`);
    if (arrival) lines.push(`   Arrived: ${arrival}`);
    for (const s of v.selections.slice(-2)) lines.push(`   Selected: “${clip(s.text, 200)}”`);
    for (const c of v.copies.slice(-2)) lines.push(`   Copied: “${clip(c.text, 200)}”`);
  });
  return lines.join('\n');
}

export function formatSearch(query: string, hits: SearchHit[], now = Date.now(), port: Port = 'mcp'): string {
  if (hits.length === 0) return `No page the user has read matches “${query}”. Try other words, or ${MORE[port].trail} for recent pages.`;
  const lines = [`${plural(hits.length, 'page', 'pages')} the user read ${hits.length === 1 ? 'matches' : 'match'} “${query}”, best first:`];
  hits.forEach((h, i) => {
    lines.push('', `${i + 1}. ${h.title || h.url} (${h.domain} · last seen ${ago(now - h.lastSeen)})`, `   ${h.url}`);
    if (h.snippet) lines.push(`   ${h.snippet}`);
  });
  return lines.join('\n');
}

export function formatPage({ page, visits }: PageResponse, maxChars: number, now = Date.now(), port: Port = 'mcp'): string {
  const head = [`# ${page.title || page.url}`, page.url];
  const last = visits[0];
  if (last) {
    const read = visits.reduce((ms, v) => ms + v.dwellMs, 0);
    const total = read >= 1000 ? ` · read ${duration(read)} in total` : '';
    head.push(`Visited ${plural(visits.length, 'time', 'times')}, last ${ago(now - last.startedAt)}${total}.`);
  }
  if (page.description) head.push('', `> ${clip(page.description, 400)}`);
  const lingered = readPassages(visits, page.blocks);
  if (lingered.length) {
    head.push('', '## Read closely', ...lingered.map((r) => `- ${clip(r.text, 300)} · ${duration(r.ms)}`));
  }
  const first = page.blocks[0];
  const blocks = first?.kind === 'heading' && first.text.trim() === page.title.trim() ? page.blocks.slice(1) : page.blocks;
  const top = Math.min(...blocks.map((b) => (b.kind === 'heading' ? (b.level ?? 2) : 6)));
  const full = [head.join('\n'), ...blocks.map((b) => blockMarkdown(b, page.kind, top))].join('\n\n');
  if (full.length <= maxChars) return full;
  return `${full.slice(0, maxChars).trimEnd()}\n\n[Truncated at ${maxChars} of ${full.length} characters; ${MORE[port].page(maxChars)}.]`;
}

/** Markdown for one block; the shallowest heading level on the page becomes `##`. */
function blockMarkdown(b: Block, kind: PageKind, topLevel: number): string {
  switch (b.kind) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, 2 + Math.max(0, (b.level ?? 2) - topLevel)))} ${b.text}`;
    case 'item':
      return kind === 'feed' && b.section ? `- **${b.section}:** ${b.text}` : `- ${b.text}`;
    case 'code': {
      const fence = b.text.includes('```') ? '~~~~' : '```';
      return `${fence}\n${b.text}\n${fence}`;
    }
    case 'quote':
      return b.text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    default:
      return b.text;
  }
}
