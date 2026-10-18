// The reflex layer: fast, typed decisions with probabilities.
// Question and answer shapes mirror TypeSafe's System One API, so the local
// engine and Jev are interchangeable.

import { buildIndex, scoreDoc } from './bm25';
import { softmax, tokenize } from './text';

export type Instructions = string | Record<string, unknown> | unknown[];

export interface NoulQuestion {
  type: 'noul';
  instructions: Instructions;
  criteria?: { true?: string; false?: string };
}

export interface ChoiceQuestion {
  type: 'choice';
  instructions: Instructions;
  /** Option name mapped to a description, or null when the name says it all. */
  criteria: Record<string, string | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: Instructions;
  /** Ordered level descriptions, lowest first. 2 to 10 levels. */
  criteria: string[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface DecisionRequest {
  state: unknown;
  questions: Record<string, Question>;
}

export interface DecisionResponse {
  engine: string;
  model?: string;
  answers: Record<string, Answer>;
  latencyMs: number;
  usage?: { input_tokens: number; output_tokens: number };
  /** Set when the primary engine failed and a backup answered. */
  fallbackReason?: string;
}

export interface DecisionEngine {
  readonly name: string;
  decide(req: DecisionRequest): Promise<DecisionResponse>;
}

export class DecisionError extends Error {
  override name = 'DecisionError';
}

const NONE_OPTION = /^(none|other|nothing|none of these|something else)$/i;
const NONE_BASELINE = 1.6;

function flatten(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(flatten).join(' ');
  return '';
}

/** The query the local engine judges against: `state.focus`, then `state.intent`, then the whole state. */
function queryOf(state: unknown): Record<string, number> {
  const s = (state && typeof state === 'object' ? state : {}) as Record<string, unknown>;
  const intent = s.intent as { terms?: Record<string, number>; text?: string } | string | undefined;
  if (typeof s.focus === 'string' && s.focus.trim()) return weightsOf(tokenize(s.focus));
  if (intent && typeof intent === 'object' && intent.terms && Object.keys(intent.terms).length) return intent.terms;
  if (typeof intent === 'string' && intent.trim()) return weightsOf(tokenize(intent));
  return weightsOf(tokenize(flatten(state)));
}

function weightsOf(tokens: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tokens) out[t] = 1;
  return out;
}

/** Share of the query's weight that the text covers, 0..1. */
function coverage(query: Record<string, number>, text: string): number {
  const total = Object.values(query).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const present = new Set(tokenize(text));
  let hit = 0;
  for (const [t, w] of Object.entries(query)) if (present.has(t)) hit += w;
  return hit / total;
}

function itemOf(state: unknown): string {
  const s = (state && typeof state === 'object' ? state : {}) as Record<string, unknown>;
  return typeof s.item === 'string' ? s.item : flatten(state);
}

/**
 * Offline reflexes. Relevance-shaped questions only: it reads `state.focus`
 * (or `state.intent`) as what the user wants and `state.item` as what is judged.
 */
export class LocalEngine implements DecisionEngine {
  readonly name = 'local';

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    const t0 = performance.now();
    const query = queryOf(req.state);
    const answers: Record<string, Answer> = {};
    for (const [key, q] of Object.entries(req.questions)) answers[key] = this.answer(q, query, req.state);
    return { engine: this.name, model: 'tacit-reflex-0', answers, latencyMs: performance.now() - t0 };
  }

  private answer(q: Question, query: Record<string, number>, state: unknown): Answer {
    if (q.type === 'choice') return this.choice(q, query);
    const r = coverage(query, itemOf(state));
    if (q.type === 'noul') return { type: 'noul', noul: 1 / (1 + Math.exp(-8 * (r - 0.3))) };
    return this.score(q, r);
  }

  private choice(q: ChoiceQuestion, query: Record<string, number>): ChoiceAnswer {
    const options = Object.keys(q.criteria);
    const texts = options.map((o) => `${o} ${q.criteria[o] ?? ''}`);
    // Few options make IDF meaningless, so coverage of the query leads and BM25 breaks ties.
    const index = buildIndex(texts.map((t) => tokenize(t)));
    const scores = options.map((o, i) => {
      const s = 4 * coverage(query, texts[i] ?? '') + 0.5 * scoreDoc(index, i, query).score;
      return NONE_OPTION.test(o.trim()) ? Math.max(s, NONE_BASELINE) : s;
    });
    const probs = softmax(scores, 1.25);
    const probabilities: Record<string, number> = {};
    options.forEach((o, i) => (probabilities[o] = probs[i] ?? 0));
    let best = 0;
    probs.forEach((p, i) => {
      if (p > (probs[best] ?? 0)) best = i;
    });
    return { type: 'choice', choice: options[best] ?? '', probabilities, confidence: probs[best] ?? 0 };
  }

  private score(q: ScoreQuestion, r: number): ScoreAnswer {
    const n = Math.max(2, Math.min(10, q.criteria.length));
    const expected = r * (n - 1);
    const raw = Array.from({ length: n }, (_, i) => Math.exp(-((i - expected) ** 2) / (2 * 0.6 ** 2)));
    const sum = raw.reduce((a, b) => a + b, 0);
    const probs = raw.map((x) => x / sum);
    const probabilities: Record<string, number> = {};
    const legend: Record<string, string> = {};
    probs.forEach((p, i) => {
      probabilities[String(i)] = p;
      legend[String(i)] = q.criteria[i] ?? String(i);
    });
    const score = probs.reduce((acc, p, i) => acc + p * i, 0);
    return { type: 'score', score, legend, probabilities, confidence: Math.max(...probs) };
  }
}

/** Try the primary engine; answer from the backup if it fails or times out. */
export class FallbackEngine implements DecisionEngine {
  constructor(
    private readonly primary: DecisionEngine,
    private readonly backup: DecisionEngine,
  ) {}

  get name(): string {
    return this.primary.name;
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    try {
      return await this.primary.decide(req);
    } catch (err) {
      const res = await this.backup.decide(req);
      return { ...res, fallbackReason: err instanceof Error ? err.message : String(err) };
    }
  }
}
