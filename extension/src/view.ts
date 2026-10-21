// From page + intent to what the surface shows: mode, suggestions, highlights, folds.

import {
  NONE_SCORE,
  cleanTitle,
  clip,
  combinedConfidence,
  describeEvidence,
  jumpActions,
  modeFor,
  rankActions,
  rankBlocks,
  softmax,
  topBlocks,
  type Action,
  type Block,
  type DecisionRequest,
  type DecisionResponse,
  type Intent,
  type Mode,
  type PageModel,
  type Question,
  type Ranked,
  type Thresholds,
} from '../../core';

export type ViewMode = Mode | 'quiet';

export interface Suggestion {
  action: Action;
  p: number;
  reasons: string[];
}

export interface View {
  mode: ViewMode;
  confidence: number;
  suggestions: Suggestion[];
  /** Ranked candidates beyond the top three, for the decision engine. */
  candidates: Ranked<Action>[];
  none: number;
  highlights: string[];
  dims: string[];
  foldRuns: string[][];
  relevantPosts: string[];
  askChoices: string[];
  ranked: Ranked<Block>[];
  engine: string;
  latencyMs?: number;
}

/** Below this the intent is a guess, and the surface asks instead of acting. */
export const SURE = 0.35;

export interface ViewOptions {
  /** Calibrated thresholds; the defaults until the user's history says otherwise. */
  thresholds?: Thresholds;
  /** False when the user keeps unfolding on this site. */
  folds?: boolean;
}

/** A conversation the user opened is chosen reading: mark what matters, never fold it. */
function foldable(page: PageModel, opts: ViewOptions): boolean {
  return opts.folds !== false && !/\/status\/\d+/.test(page.url);
}

function choicesFor(page: PageModel, intent: Intent): string[] {
  const out: string[] = [];
  // The page you are on is not an answer to "what are you here for".
  const seen = new Set<string>([cleanTitle(page.title).toLowerCase()]);
  const add = (text: string) => {
    const c = clip(text, 60);
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      out.push(c);
    }
  };
  intent.candidates.forEach((c) => add(c.text));
  const levels = page.outline.map((o) => o.level);
  const sectionLevel = levels.length ? Math.min(...levels) + (levels.filter((l) => l === Math.min(...levels)).length === 1 ? 1 : 0) : 2;
  page.outline.filter((o) => o.level === sectionLevel).forEach((o) => add(o.text));
  // Three, so each has a key (⌥1–3).
  return out.slice(0, 3);
}

function base(page: PageModel, intent: Intent, ranked: Ranked<Block>[]): View {
  return {
    mode: 'quiet',
    confidence: 0,
    suggestions: [],
    candidates: [],
    none: 1,
    highlights: [],
    dims: [],
    foldRuns: [],
    relevantPosts: [],
    askChoices: choicesFor(page, intent),
    ranked,
    engine: 'local',
  };
}

function foldRunsOf(posts: Ranked<Block>[], fold: Set<string>): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const r of posts) {
    if (fold.has(r.item.id)) run.push(r.item.id);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

function feedView(page: PageModel, intent: Intent, ranked: Ranked<Block>[], unfolded: Set<string>, opts: ViewOptions): View {
  const v = base(page, intent, ranked);
  const sure = intent.confidence >= (opts.thresholds?.suggest ?? SURE);
  const posts = ranked.filter((r) => r.item.kind === 'item');
  const relevant = posts.filter((r) => r.score >= 1 && r.relevance >= 0.35).sort((a, b) => b.score - a.score);
  // Fold only when the feed clearly has something for this intent; never empty a feed on a guess.
  const fold = new Set(
    sure && relevant.length >= 2 && foldable(page, opts) ? posts.filter((r) => r.score === 0 && !unfolded.has(r.item.id)).map((r) => r.item.id) : [],
  );
  const jumps = new Map(page.actions.filter((a) => a.kind === 'jump' && a.targetBlockId).map((a) => [a.targetBlockId!, a]));
  const top = relevant.slice(0, 3);
  const probs = softmax([...top.map((r) => r.score), NONE_SCORE], 1.25);
  v.suggestions = top.flatMap((r, i) => {
    const action = jumps.get(r.item.id);
    return action ? [{ action, p: probs[i] ?? 0, reasons: r.reasons }] : [];
  });
  v.none = probs[probs.length - 1] ?? 1;
  v.confidence = combinedConfidence(intent.confidence, probs[0] ?? 0);
  v.relevantPosts = relevant.map((r) => r.item.id);
  v.foldRuns = foldRunsOf(posts, fold);
  v.mode = !sure ? 'ask' : modeFor(v.confidence, opts.thresholds) === 'act' && v.suggestions.length ? 'act' : 'suggest';
  return v;
}

export function computeView(page: PageModel, intent: Intent, feed: boolean, unfolded: Set<string> = new Set(), opts: ViewOptions = {}): View {
  const ranked = rankBlocks(page.blocks, intent);
  if (intent.source === 'none') return base(page, intent, ranked);
  if (feed) return feedView(page, intent, ranked, unfolded, opts);

  const v = base(page, intent, ranked);
  const sure = intent.confidence >= (opts.thresholds?.suggest ?? SURE);
  v.highlights = sure ? topBlocks(ranked, 3, 0.5).map((r) => r.item.id) : [];
  v.dims = sure && v.highlights.length ? ranked.filter((r) => r.item.kind !== 'heading' && r.relevance < 0.12).map((r) => r.item.id) : [];
  const ranking = rankActions([...jumpActions(ranked, 2), ...page.actions], intent, 12);
  v.candidates = ranking.ranked;
  v.suggestions = ranking.ranked.slice(0, 3).map((r) => ({ action: r.item, p: r.p, reasons: r.reasons }));
  v.none = ranking.none;
  v.confidence = combinedConfidence(intent.confidence, ranking.confidence);
  if (!sure) v.mode = 'ask';
  else if (v.suggestions.length) v.mode = modeFor(v.confidence, opts.thresholds) === 'act' ? 'act' : 'suggest';
  else v.mode = v.highlights.length ? 'suggest' : 'quiet';
  return v;
}

export interface DecisionKeys {
  next: Map<string, Action>;
  posts: Map<string, string>;
}

/** Jev-shaped questions for the harness: which action next, and which posts matter. */
export function buildDecision(page: PageModel, intent: Intent, view: View, feed: boolean): { request: DecisionRequest; keys: DecisionKeys } | null {
  if (intent.source === 'none') return null;
  const keys: DecisionKeys = { next: new Map(), posts: new Map() };
  const questions: Record<string, Question> = {};
  if (!feed && view.candidates.length) {
    const criteria: Record<string, string | null> = {};
    view.candidates.forEach((r, i) => {
      const key = `${i + 1}. ${clip(r.item.label, 80)}`;
      keys.next.set(key, r.item);
      criteria[key] = r.item.context ? clip(r.item.context, 160) : null;
    });
    criteria.none = 'None of these; the user wants something else';
    questions.next = {
      type: 'choice',
      instructions: 'Given what the user is trying to do, which of these is the next thing they want on this page?',
      criteria,
    };
  }
  if (feed) {
    view.ranked
      .filter((r) => r.item.kind === 'item')
      .slice(0, 40)
      .forEach((r, i) => {
        const key = `post_${i}`;
        keys.posts.set(key, r.item.id);
        questions[key] = {
          type: 'noul',
          instructions: { question: 'Is this post about what the user is trying to do right now?', post: clip(r.item.text, 500), author: r.item.section },
        };
      });
  }
  if (Object.keys(questions).length === 0) return null;
  const state = {
    user_intent: intent.text,
    evidence: intent.evidence.slice(0, 3).map((e) => describeEvidence(e)),
    page: { title: page.title, url: page.url, kind: page.kind },
  };
  return { request: { state, questions }, keys };
}

/** Replace local estimates with the engine's answers. */
export function refineView(
  view: View,
  intent: Intent,
  res: DecisionResponse,
  keys: DecisionKeys,
  unfolded: Set<string>,
  actions: Action[],
  opts: ViewOptions & { page?: PageModel } = {},
): View {
  const v: View = { ...view, engine: res.engine, latencyMs: Math.round(res.latencyMs) };
  const sure = intent.confidence >= (opts.thresholds?.suggest ?? SURE);
  const act = opts.thresholds?.act ?? 0.6;
  const next = res.answers.next;
  if (next?.type === 'choice') {
    const reasons = new Map(view.candidates.map((c) => [c.item.id, c.reasons]));
    const scored = [...keys.next.entries()].map(([k, action]) => ({ action, p: next.probabilities[k] ?? 0 })).sort((a, b) => b.p - a.p);
    v.suggestions = scored
      .filter((s) => s.p >= 0.05)
      .slice(0, 3)
      .map((s) => ({ action: s.action, p: s.p, reasons: reasons.get(s.action.id) ?? [`chosen by ${res.engine}`] }));
    v.none = next.probabilities.none ?? 0;
    v.confidence = combinedConfidence(intent.confidence, scored[0]?.p ?? 0);
    v.mode = !sure ? 'ask' : next.choice === 'none' || v.confidence < act ? 'suggest' : 'act';
  }
  if (keys.posts.size) {
    const yes = new Map<string, number>();
    for (const [k, id] of keys.posts) {
      const a = res.answers[k];
      yes.set(id, a?.type === 'noul' ? a.noul : 0.5);
    }
    const posts = view.ranked.filter((r) => r.item.kind === 'item');
    const relevant = posts.filter((r) => (yes.get(r.item.id) ?? 0) >= 0.6).sort((a, b) => (yes.get(b.item.id) ?? 0) - (yes.get(a.item.id) ?? 0));
    const fold = new Set(
      sure && relevant.length >= 2 && (!opts.page || foldable(opts.page, opts))
        ? posts.filter((r) => yes.has(r.item.id) && (yes.get(r.item.id) ?? 1) < 0.2 && !unfolded.has(r.item.id)).map((r) => r.item.id)
        : [],
    );
    v.relevantPosts = relevant.map((r) => r.item.id);
    v.foldRuns = foldRunsOf(posts, fold);
    const jumps = new Map(actions.filter((a) => a.kind === 'jump' && a.targetBlockId).map((a) => [a.targetBlockId!, a]));
    v.suggestions = relevant.slice(0, 3).flatMap((r) => {
      const action = jumps.get(r.item.id);
      return action ? [{ action, p: yes.get(r.item.id) ?? 0, reasons: [`${res.engine}: about “${clip(intent.text, 40)}”`] }] : [];
    });
    v.mode = !sure ? 'ask' : 'suggest';
  }
  return v;
}
