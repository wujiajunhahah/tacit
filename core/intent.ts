// Inferring what the user is trying to do from the trail they left.

import { cleanTitle, clip, softmax, tokenize } from './text';
import type { Evidence, EvidenceKind, Intent, Visit } from './types';

export interface IntentOptions {
  now?: number;
  /** Evidence loses half its weight every halfLifeMs. Default 15 min. */
  halfLifeMs?: number;
  /** Evidence older than this is ignored. Default 90 min. */
  windowMs?: number;
  /** Title of the page being viewed right now. */
  currentTitle?: string;
}

const BASE: Record<EvidenceKind, number> = {
  stated: 6,
  search: 4,
  copy: 3.5,
  selection: 3,
  read: 2,
  click: 1.5,
  dwell: 1.2,
  title: 0.8,
};

/** A passage under the pointer is a stronger sign than one that merely stayed in view. */
const READ_VIA = { pointer: 1.2, view: 0.5 };

/** 1.5 s of attention is a hint, 10 s is a strong signal; capped so one passage cannot drown the rest. */
export function readImportance(ms: number): number {
  return Math.min(1.5, 0.35 + ms / 8000);
}

const CANDIDATE_KINDS = new Set<EvidenceKind>(['stated', 'search', 'copy', 'selection', 'dwell', 'title']);
const STATED_TTL_MS = 45 * 60_000;
const MAX_TERMS = 24;
/** Weight an older search keeps once a newer search or stated goal exists. */
const SUPERSEDED = 0.35;
/** Score of "something we have not seen". Keeps one weak signal from looking certain. */
const UNEXPLAINED_SCORE = 1.5;

export const NO_INTENT: Intent = { text: '', terms: {}, confidence: 0, source: 'none', evidence: [], candidates: [] };

/** How long a page with no title of its own may last and still be only a redirect on the way somewhere. */
const HOP_MS = 3000;

/**
 * A redirect on the way somewhere else (a search engine's click-through, a link shortener): no title of its own,
 * gone in moments. Its arrival still counts as evidence; it is never shown as a page you were on.
 */
export function isHop(v: Pick<Visit, 'url' | 'title' | 'dwellMs' | 'endedAt'>): boolean {
  return v.endedAt !== undefined && v.dwellMs < HOP_MS && (!v.title || v.title === v.url);
}

export function collectEvidence(trail: Visit[], opts: IntentOptions = {}): Evidence[] {
  const now = opts.now ?? Date.now();
  const halfLife = opts.halfLifeMs ?? 15 * 60_000;
  const windowMs = opts.windowMs ?? 90 * 60_000;
  const merged = new Map<string, { ev: Evidence; extra: number }>();

  const push = (kind: EvidenceKind, raw: string, at: number, scale = 1) => {
    const text = clip(raw, 160);
    const age = Math.max(0, now - at);
    if (!text || age > windowMs || tokenize(text).length === 0) return;
    const weight = BASE[kind] * scale * Math.pow(0.5, age / halfLife);
    const key = `${kind}:${text.toLowerCase()}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, { ev: { kind, text, at, weight }, extra: 0 });
    else if (weight > prev.ev.weight) merged.set(key, { ev: { kind, text, at, weight }, extra: prev.extra + prev.ev.weight });
    else prev.extra += weight;
  };

  for (const v of trail) {
    if (v.statedIntent && now - v.statedIntent.at <= STATED_TTL_MS) push('stated', v.statedIntent.text, v.statedIntent.at);
    if (v.arrival.searchQuery) push('search', v.arrival.searchQuery, v.startedAt);
    if (v.searchQuery) push('search', v.searchQuery, v.startedAt);
    for (const s of v.selections) push('selection', s.text, s.at);
    for (const c of v.copies) push('copy', c.text, c.at);
    for (const c of v.clicks) push('click', c.label, c.at);
    for (const r of v.reads ?? []) push('read', r.text, r.at, READ_VIA[r.via] * readImportance(r.ms));
    if (v.dwellMs >= 8000 && v.title) push('dwell', cleanTitle(v.title), v.endedAt ?? now, 0.25 + Math.min(1, v.dwellMs / 60_000));
  }
  if (opts.currentTitle) push('title', cleanTitle(opts.currentTitle), now);

  // A new search or stated goal replaces the previous one: each newer one cuts the older weight to 35%.
  [...merged.values()]
    .filter(({ ev }) => ev.kind === 'search' || ev.kind === 'stated')
    .sort((a, b) => b.ev.at - a.ev.at)
    .forEach((x, i) => {
      const keep = Math.pow(SUPERSEDED, i);
      x.ev.weight *= keep;
      x.extra *= keep;
    });

  // Repeated signals reinforce each other, with diminishing returns.
  return [...merged.values()]
    .map(({ ev, extra }) => ({ ...ev, weight: ev.weight + 0.25 * extra }))
    .sort((a, b) => b.weight - a.weight);
}

export function inferIntent(trail: Visit[], opts: IntentOptions = {}): Intent {
  const evidence = collectEvidence(trail, opts);
  if (evidence.length === 0) return NO_INTENT;

  const mass = new Map<string, number>();
  // Reading says which words matter, not what the goal is called: it weighs terms but does not vote.
  const vote = new Map<string, number>();
  const tokensOf = evidence.map((ev) => {
    const toks = [...new Set(tokenize(ev.text))];
    const share = ev.weight / Math.sqrt(Math.max(toks.length, 1));
    for (const t of toks) {
      mass.set(t, (mass.get(t) ?? 0) + share);
      if (ev.kind !== 'read') vote.set(t, (vote.get(t) ?? 0) + share);
    }
    return toks;
  });

  type Candidate = { text: string; kind: EvidenceKind; score: number; toks: string[] };
  const byText = new Map<string, Candidate>();
  evidence.forEach((ev, i) => {
    const toks = tokensOf[i] ?? [];
    if (!CANDIDATE_KINDS.has(ev.kind) || toks.length === 0) return;
    const own = ev.weight / Math.sqrt(toks.length);
    let support = 0;
    for (const t of toks) support += Math.max(0, (vote.get(t) ?? 0) - own);
    const score = ev.weight + 0.6 * (support / toks.length);
    const key = ev.text.toLowerCase();
    const prev = byText.get(key);
    if (!prev || score > prev.score) byText.set(key, { text: ev.text, kind: ev.kind, score, toks });
  });

  const candidates = [...byText.values()].sort((a, b) => b.score - a.score);
  const top = candidates[0];
  if (!top) return { ...NO_INTENT, evidence: evidence.slice(0, 6) };

  const probs = softmax([...candidates.map((c) => c.score), UNEXPLAINED_SCORE], 1);
  const stated = top.kind === 'stated';

  const maxMass = Math.max(...mass.values());
  const weighted: [string, number][] = [...mass.entries()].map(([t, m]) => [t, 0.35 * (m / maxMass)]);
  const terms = Object.fromEntries(weighted);
  for (const t of top.toks) terms[t] = 1;
  const trimmed = Object.fromEntries(
    Object.entries(terms)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TERMS),
  );

  const topP = probs[0] ?? 0;
  return {
    text: clip(top.text, 80),
    terms: trimmed,
    confidence: stated ? Math.max(0.9, topP) : topP,
    source: stated ? 'stated' : 'inferred',
    evidence: evidence.slice(0, 6),
    candidates: candidates.slice(0, 4).map((c, i) => ({ text: clip(c.text, 80), p: probs[i] ?? 0 })),
  };
}

/** A human sentence for one piece of evidence, e.g. `searched "jev latency" · 3 min ago`. */
export function describeEvidence(ev: Evidence, now = Date.now()): string {
  const verb: Record<EvidenceKind, string> = {
    stated: 'you said',
    search: 'searched',
    copy: 'copied',
    selection: 'selected',
    read: 'read closely',
    click: 'clicked',
    dwell: 'read',
    title: 'reading',
  };
  return `${verb[ev.kind]} “${clip(ev.text, 60)}” · ${ago(now - ev.at)}`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
