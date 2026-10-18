// Jev, TypeSafe AI's System One model, behind the DecisionEngine interface.
// API: POST {baseUrl}/v1/systemone with { model, state, questions } (docs.typesafe.ai/api).

import {
  DecisionError,
  type Answer,
  type DecisionEngine,
  type DecisionRequest,
  type DecisionResponse,
  type Question,
} from './decision';

export interface JevOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const JEV_DEFAULT_MODEL = 'jev-latest';
export const JEV_DEFAULT_BASE_URL = 'https://api.typesafe.ai';

export class JevEngine implements DecisionEngine {
  readonly name = 'jev';
  private readonly opts: Required<Omit<JevOptions, 'fetch'>> & { fetch: typeof fetch };

  constructor(opts: JevOptions) {
    if (!opts.apiKey) throw new DecisionError('JevEngine needs an API key');
    this.opts = {
      apiKey: opts.apiKey,
      model: opts.model ?? JEV_DEFAULT_MODEL,
      baseUrl: (opts.baseUrl ?? JEV_DEFAULT_BASE_URL).replace(/\/+$/, ''),
      timeoutMs: opts.timeoutMs ?? 2500,
      fetch: opts.fetch ?? fetch,
    };
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    try {
      const res = await this.opts.fetch(`${this.opts.baseUrl}/v1/systemone`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.opts.model, state: req.state, questions: req.questions }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new DecisionError(`Jev HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { model?: string; answers?: Record<string, unknown>; usage?: DecisionResponse['usage'] };
      return {
        engine: this.name,
        model: json.model,
        answers: normalizeAnswers(json.answers ?? {}, req.questions),
        latencyMs: performance.now() - t0,
        usage: json.usage,
      };
    } catch (err) {
      if (err instanceof DecisionError) throw err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new DecisionError(aborted ? `Jev timed out after ${this.opts.timeoutMs} ms` : `Jev request failed: ${String(err)}`);
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

/** Coerce Jev's answers into our shapes; tolerate optional fields and older field names. */
export function normalizeAnswers(raw: Record<string, unknown>, questions: Record<string, Question>): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = (raw[key] ?? {}) as Record<string, unknown>;
    if (!raw[key]) throw new DecisionError(`Jev returned no answer for "${key}"`);
    if (q.type === 'noul') {
      out[key] = { type: 'noul', noul: num(a.noul, num(a.probability)) };
    } else if (q.type === 'choice') {
      const p = probs(a.probabilities);
      const choice = typeof a.choice === 'string' ? a.choice : Object.entries(p).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
      out[key] = { type: 'choice', choice, probabilities: p, confidence: num(a.confidence, p[choice] ?? 0) };
    } else {
      const p = probs(a.probabilities);
      const legend = (a.legend && typeof a.legend === 'object' ? a.legend : {}) as Record<string, string>;
      out[key] = { type: 'score', score: num(a.score), legend, probabilities: p, confidence: num(a.confidence, Math.max(0, ...Object.values(p))) };
    }
  }
  return out;
}
