// The handoff packet: what an agent needs from this page, instead of Cmd+A.

import { describeEvidence, isHop } from './intent';
import { topBlocks } from './rank';
import { clip, domainOf, estimateTokens } from './text';
import { sameDocument, searchQueryOf } from './url';
import type { Block, Intent, PageModel, Ranked, Read, Visit } from './types';

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

/** A passage read twice (a page that repeats it, a re-render) appears once, with the time added up. */
export function distinctReads(reads: Read[]): Read[] {
  const byText = new Map<string, Read>();
  for (const r of reads) {
    const key = r.text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 160);
    const seen = byText.get(key);
    if (seen) seen.ms += r.ms;
    else byText.set(key, { ...r });
  }
  return [...byText.values()];
}

/** Below this, a guess about the goal misleads more than it helps; the path and the focus still say a lot. */
const SURE_ENOUGH = 0.35;
/** A page this short goes whole: cheaper than choosing from it. */
const WHOLE_PAGE_TOKENS = 300;

/** One step of the path here, the way the person would tell it. */
function step(v: Visit): string {
  const query = v.searchQuery ?? searchQueryOf(v.url);
  if (query) return `searched “${clip(query, 80)}” (${v.domain})`;
  const read = v.dwellMs >= 5000 ? ` · ${duration(v.dwellMs)}` : '';
  const closely = v.reads?.length ? `, read ${v.reads.length} passage${v.reads.length === 1 ? '' : 's'} closely` : '';
  return `read “${clip(v.title || v.url, 70)}” (${v.domain}${read}${closely})`;
}

/** What the person did on this page, in the order they did it. */
function focusOf(visit: Visit | undefined, selection: string | undefined): string[] {
  if (!visit) return selection ? [`- selected: “${clip(selection, 600)}”`] : [];
  const moments: { at: number; line: string }[] = [
    ...visit.selections.map((m) => ({ at: m.at, line: `- selected: “${clip(m.text, 600)}”` })),
    ...visit.copies.map((m) => ({ at: m.at, line: `- copied: “${clip(m.text, 400)}”` })),
    ...distinctReads(visit.reads ?? []).map((r) => ({ at: r.at, line: `- read closely (${Math.max(1, Math.round(r.ms / 1000))} s): ${clip(r.text, 400)}` })),
  ];
  if (selection && !visit.selections.some((m) => m.text === selection)) moments.push({ at: Number.MAX_SAFE_INTEGER, line: `- selected: “${clip(selection, 600)}”` });
  return moments.sort((a, b) => a.at - b.at).slice(-8).map((m) => m.line);
}

/**
 * The packet follows the person's line of thought: what they are after, the path that brought them here, what they
 * did on this page in the order they did it, and then the page, read for its kind: a results page as its results
 * (the ones they opened marked), a feed as the posts about their goal, a short page whole, a long one as the
 * passages that answer them and its outline.
 */
export function buildPacket(input: PacketInput): Packet {
  const now = input.now ?? Date.now();
  const { page, intent, visit } = input;
  const lines: string[] = [`# Context: ${page.title || page.url}`, page.url, ''];

  if (intent.source === 'stated' || (intent.source !== 'none' && intent.text && intent.confidence >= SURE_ENOUGH)) {
    const label = intent.source === 'stated' ? 'stated' : `inferred · ${Math.round(intent.confidence * 100)}%`;
    lines.push(`**What I'm trying to do** (${label}): ${intent.text}`);
    const said = intent.evidence.find((e) => e.kind === 'stated' || e.kind === 'search');
    if (said) lines.push(`- ${describeEvidence(said, now)}`);
    lines.push('');
  }

  const arrival = describeArrival(visit);
  if (arrival) lines.push(`**How I got here:** ${arrival}`, '');

  // Not the redirects on the way, nor this same page from an earlier visit. Oldest first: the way the thought went.
  const earlier = (input.trail ?? []).filter((v) => !isHop(v) && !sameDocument(v.url, page.url)).slice(-5);
  if (earlier.length) {
    lines.push('## Before this');
    earlier.forEach((v, i) => lines.push(`${i + 1}. ${step(v)}`));
    lines.push('');
  }

  const focus = focusOf(visit, input.selection);
  if (focus.length) lines.push('## What I did on this page', ...focus, '');

  const read = new Set((visit?.reads ?? []).map((r) => r.blockId));
  const order = new Map(page.blocks.map((b, i) => [b.id, i]));
  const pageTokens = estimateTokens(page.blocks.map((b) => b.text).join('\n'));

  if (page.kind === 'search' && page.blocks.length) {
    // A results page is its results; the ones the person opened are what they made of them.
    const opened = (visit?.clicks ?? []).map((c) => c.label.toLowerCase().slice(0, 40)).filter(Boolean);
    lines.push('## Results on this page');
    page.blocks.slice(0, 8).forEach((b, i) => {
      const title = b.text.split(' — ')[0]!.toLowerCase();
      const mark = opened.some((o) => title.startsWith(o) || o.startsWith(title.slice(0, 30))) ? ' **(I opened this)**' : '';
      lines.push(`${i + 1}. ${clip(b.text, 300)}${mark}`);
    });
    lines.push('');
  } else if (pageTokens <= WHOLE_PAGE_TOKENS && page.blocks.length) {
    lines.push('## The page');
    for (const b of page.blocks) lines.push(b.kind === 'heading' ? `### ${clip(b.text, 120)}` : clip(b.text, 1200));
    lines.push('');
  } else {
    const passages = topBlocks(input.ranked ?? [], input.maxPassages ?? 5)
      .filter((r) => !read.has(r.item.id))
      .sort((a, b) => (order.get(a.item.id) ?? 0) - (order.get(b.item.id) ?? 0));
    if (passages.length) {
      lines.push(page.kind === 'feed' ? '## Posts about what I am after' : '## Most relevant on this page');
      let section = '';
      for (const r of passages) {
        if (page.kind !== 'feed' && r.item.section && r.item.section !== section) {
          section = r.item.section;
          lines.push(`### ${clip(section, 80)}`);
        }
        lines.push(page.kind === 'feed' && r.item.section ? `- **${clip(r.item.section, 40)}:** ${clip(r.item.text, 500)}` : clip(r.item.text, 900), '');
      }
    } else if (page.description) {
      lines.push('## Summary', clip(page.description, 600), '');
    }
    if (page.kind !== 'feed' && page.outline.length >= 3) {
      lines.push('## Page outline');
      const minLevel = Math.min(...page.outline.map((o) => o.level));
      for (const o of page.outline.slice(0, 24)) lines.push(`${'  '.repeat(Math.max(0, o.level - minLevel))}- ${clip(o.text, 80)}`);
      lines.push('');
    }
  }

  const body = lines.join('\n').trim();
  const tokens = estimateTokens(body);
  const fullPageTokens = pageTokens;
  const saved = fullPageTokens > 0 ? Math.max(0, 1 - tokens / fullPageTokens) : 0;
  // On a short page the packet can outweigh the page, since it also carries the intent and the path here: then the
  // comparison says nothing.
  const footer =
    tokens < fullPageTokens
      ? `\n\n---\nShared by Tacit · ~${tokens} tokens instead of ~${fullPageTokens} for the whole page`
      : `\n\n---\nShared by Tacit · ~${tokens} tokens, with how I got here`;
  return { markdown: body + footer, tokens, fullPageTokens, saved };
}
