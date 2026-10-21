// The handoff packet: what an agent needs from this page, instead of Cmd+A.

import { describeEvidence } from './intent';
import { topBlocks } from './rank';
import { clip, domainOf, estimateTokens } from './text';
import type { Block, Intent, PageModel, Ranked, Visit } from './types';

export interface PacketInput {
  page: PageModel;
  intent: Intent;
  visit?: Visit;
  /** Earlier visits, oldest first. Excludes the current visit. */
  trail?: Visit[];
  selection?: string;
  ranked?: Ranked<Block>[];
  maxPassages?: number;
  now?: number;
}

export interface Packet {
  markdown: string;
  tokens: number;
  fullPageTokens: number;
  /** Share of the page's tokens the agent did not have to read, 0..1. */
  saved: number;
}

function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

export function describeArrival(visit?: Visit): string {
  if (!visit) return '';
  const a = visit.arrival;
  const from = a.fromTitle ? `“${clip(a.fromTitle, 60)}”` : a.fromUrl ? domainOf(a.fromUrl) : '';
  const via = a.viaLabel ? `clicked “${clip(a.viaLabel, 60)}”` : '';
  switch (a.kind) {
    case 'search':
      return [`searched “${clip(a.searchQuery ?? '', 80)}”`, from && `on ${from}`, via].filter(Boolean).join(' → ');
    case 'link':
      return [from && `from ${from}`, via].filter(Boolean).join(' → ') || 'followed a link';
    case 'tacit':
      return [from && `from ${from}`, 'Tacit suggested this page'].filter(Boolean).join(' → ');
    case 'typed':
      return 'typed the address';
    case 'bookmark':
      return 'opened a bookmark';
    case 'back_forward':
      return 'came back to it';
    case 'reload':
      return 'reloaded the page';
    case 'new_tab':
      return from ? `opened from ${from} in a new tab` : 'opened in a new tab';
    default:
      return '';
  }
}

export function buildPacket(input: PacketInput): Packet {
  const now = input.now ?? Date.now();
  const { page, intent, visit } = input;
  const lines: string[] = [`# Context: ${page.title || page.url}`, page.url, ''];

  if (intent.source !== 'none' && intent.text) {
    const label = intent.source === 'stated' ? 'stated' : `inferred · ${Math.round(intent.confidence * 100)}%`;
    lines.push(`**What I'm trying to do** (${label}): ${intent.text}`);
    for (const ev of intent.evidence.filter((e) => e.kind !== 'read').slice(0, 3)) lines.push(`- ${describeEvidence(ev, now)}`);
    lines.push('');
  }

  const arrival = describeArrival(visit);
  if (arrival) lines.push(`**How I got here:** ${arrival}`, '');

  const selection = input.selection ?? visit?.selections.at(-1)?.text;
  if (selection) {
    lines.push('**I selected:**', ...clip(selection, 1200).split('\n').map((l) => `> ${l}`), '');
  }

  const reads = (visit?.reads ?? []).slice(0, 4);
  if (reads.length) {
    lines.push('## Passages I read closely');
    for (const r of reads) lines.push(`- (${Math.max(1, Math.round(r.ms / 1000))} s) ${clip(r.text, 400)}`);
    lines.push('');
  }

  const read = new Set(reads.map((r) => r.blockId));
  const order = new Map(page.blocks.map((b, i) => [b.id, i]));
  const passages = topBlocks(input.ranked ?? [], input.maxPassages ?? 5)
    .filter((r) => !read.has(r.item.id))
    .sort((a, b) => (order.get(a.item.id) ?? 0) - (order.get(b.item.id) ?? 0));
  if (passages.length) {
    lines.push('## Most relevant on this page');
    let section = '';
    for (const r of passages) {
      if (r.item.section && r.item.section !== section) {
        section = r.item.section;
        lines.push(`### ${clip(section, 80)}`);
      }
      lines.push(clip(r.item.text, 900), '');
    }
  } else if (page.description) {
    lines.push('## Summary', clip(page.description, 600), '');
  }

  if (page.outline.length) {
    lines.push('## Page outline');
    const minLevel = Math.min(...page.outline.map((o) => o.level));
    for (const o of page.outline.slice(0, 24)) lines.push(`${'  '.repeat(Math.max(0, o.level - minLevel))}- ${clip(o.text, 80)}`);
    lines.push('');
  }

  const earlier = (input.trail ?? []).slice(-5).reverse();
  if (earlier.length) {
    lines.push('## Before this');
    for (const v of earlier) {
      const read = v.dwellMs >= 5000 ? ` · read ${duration(v.dwellMs)}` : '';
      lines.push(`- ${clip(v.title || v.url, 70)} (${v.domain})${read}`);
    }
    lines.push('');
  }

  const body = lines.join('\n').trim();
  const tokens = estimateTokens(body);
  const fullPageTokens = estimateTokens(page.blocks.map((b) => b.text).join('\n'));
  const saved = fullPageTokens > 0 ? Math.max(0, 1 - tokens / fullPageTokens) : 0;
  const footer = `\n\n---\nShared by Tacit · ~${tokens} tokens instead of ~${fullPageTokens} for the whole page`;
  return { markdown: body + footer, tokens, fullPageTokens, saved };
}
