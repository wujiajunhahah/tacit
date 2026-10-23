// TypeSafe's System One API: typed questions in, probabilities out. Jev is TypeSafe's model; the same request,
// POST {baseUrl}/v1/systemone with { model, state, questions }, is also served by OpenRouter (base
// https://openrouter.ai/api), and by Ollama, LM Studio, llama.cpp and vLLM for decision models running locally.

import {
  choiceConfidence,
  DecisionError,
  type Answer,
  type DecisionEngine,
  type DecisionRequest,
  type DecisionResponse,
  type Question,
} from './decision';

export interface SystemOneOptions {
  /** What the cascade, the ledger and the dashboard call this engine. */
  name?: string;
  /** Local servers need none. */
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Extra request fields, e.g. OpenRouter's provider routing. */
  body?: Record<string, unknown>;
  fetch?: typeof fetch;
}

export const JEV_DEFAULT_MODEL = 'jev-latest';
export const JEV_DEFAULT_BASE_URL = 'https://api.typesafe.ai';

export class SystemOneEngine implements DecisionEngine {
  readonly name: string;
  private readonly opts: Required<Omit<SystemOneOptions, 'apiKey' | 'headers' | 'body'>> & Pick<SystemOneOptions, 'apiKey' | 'headers' | 'body'>;

  constructor(opts: SystemOneOptions) {
    this.name = opts.name ?? 'jev';
    this.opts = {
      ...opts,
      name: this.name,
      model: opts.model ?? JEV_DEFAULT_MODEL,
      baseUrl: (opts.baseUrl ?? JEV_DEFAULT_BASE_URL).replace(/\/+$/, ''),
      timeoutMs: opts.timeoutMs ?? 2500,
      fetch: opts.fetch ?? fetch,
    };
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    const t0 = performance.now();
    const ctrl = new AbortController();
    // Only our own timer means a timeout; a proxy that drops the connection aborts too, and should say so.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, this.opts.timeoutMs);
    try {
      const res = await this.opts.fetch(`${this.opts.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}), ...this.opts.headers },
        body: JSON.stringify({ model: this.opts.model, state: req.state, questions: req.questions, ...this.opts.body }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new DecisionError(`${this.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { model?: string; answers?: Record<string, unknown>; usage?: DecisionResponse['usage'] };
      return {
        engine: this.name,
        model: json.model ?? this.opts.model,
        answers: normalizeAnswers(json.answers ?? {}, req.questions, this.name),
        latencyMs: performance.now() - t0,
        usage: json.usage,
      };
    } catch (err) {
      if (err instanceof DecisionError) throw err;
      throw new DecisionError(timedOut ? `${this.name} timed out after ${this.opts.timeoutMs} ms` : `${this.name} request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function num(x: unknown, fallback = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

function probs(x: unknown): Record<string, number> {
  if (!x || typeof x !== 'object') return {};
  return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, num(v)]));
}

/** Coerce System One answers into our shapes; tolerate optional fields and older field names. */
export function normalizeAnswers(raw: Record<string, unknown>, questions: Record<string, Question>, name = 'jev'): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = (raw[key] ?? {}) as Record<string, unknown>;
    if (!raw[key]) throw new DecisionError(`${name} returned no answer for "${key}"`);
    if (q.type === 'noul') {
      out[key] = { type: 'noul', noul: num(a.noul, num(a.probability)) };
    } else if (q.type === 'choice') {
      const p = probs(a.probabilities);
      const choice = typeof a.choice === 'string' ? a.choice : Object.entries(p).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
      out[key] = { type: 'choice', choice, probabilities: p, confidence: num(a.confidence, choiceConfidence(p)) };
    } else {
      const p = probs(a.probabilities);
      const legend = (a.legend && typeof a.legend === 'object' ? a.legend : {}) as Record<string, string>;
      out[key] = { type: 'score', score: num(a.score), legend, probabilities: p, confidence: num(a.confidence, Math.max(0, ...Object.values(p))) };
    }
  }
  return out;
}
