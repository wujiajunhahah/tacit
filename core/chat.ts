// Any OpenAI-compatible chat endpoint as a reflex: OpenRouter, DeepSeek, Ollama, LM Studio, vLLM, llama.cpp, OpenAI.
// It answers the same typed questions as Jev, through a JSON schema built for each request, so a reply always parses;
// where an API takes no schema (DeepSeek), through JSON mode, with the schema in the request.
// A chat model's probabilities are its own say-so, and often overconfident, so they are pulled toward uniform before
// the policy weighs them: the same certainty from a chat model counts for a little less than from Jev.

import { choiceConfidence, DecisionError, type Answer, type DecisionEngine, type DecisionRequest, type DecisionResponse, type Question } from './decision';

export interface ChatOptions {
  /** Provider id: what the ledger and the dashboard call it. */
  name: string;
  /** Up to and including /v1, e.g. https://openrouter.ai/api/v1 or http://127.0.0.1:11434/v1. */
  baseUrl: string;
  apiKey?: string;
  /** The model asked; providers that route (OpenRouter) may fall back to the rest themselves. */
  models: string[];
  timeoutMs?: number;
  /** Provider-specific request fields, e.g. OpenRouter's routing preferences. */
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Weight kept on the model's own probabilities (0..1); the rest is spread evenly. */
  trust?: number;
  /** "object": the API has JSON mode but no JSON schema, so the schema goes in the request. */
  json?: 'schema' | 'object';
  fetch?: typeof fetch;
}

export const CHAT_TRUST = 0.85;

const SYSTEM = `You judge, for a browser interface, what a person is doing and what they want next. Answers are needed in a fraction of a second.
You get "state" (what they seem to be after, the evidence for it, the page) and "questions". Answer every question:
- choice: pick the option that best fits what the person wants next, and give a probability for every option; they sum to 1.
- score: give a probability for every level, keyed "0" (the lowest) upward; they sum to 1.
- noul: the probability, from 0 to 1, that the answer is yes.
Be decisive when the evidence is clear, and spread the probability when it is not. Reply with JSON only.`;

const numbers = (keys: string[]) => ({
  type: 'object',
  properties: Object.fromEntries(keys.map((k) => [k, { type: 'number' }])),
  required: keys,
  additionalProperties: false,
});

function schemaOf(q: Question): object {
  if (q.type === 'noul') return { type: 'object', properties: { noul: { type: 'number' } }, required: ['noul'], additionalProperties: false };
  if (q.type === 'choice') {
    const options = Object.keys(q.criteria);
    return { type: 'object', properties: { choice: { type: 'string', enum: options }, probabilities: numbers(options) }, required: ['choice', 'probabilities'], additionalProperties: false };
  }
  return { type: 'object', properties: { probabilities: numbers(q.criteria.map((_, i) => String(i))) }, required: ['probabilities'], additionalProperties: false };
}

/** The JSON schema of one reply: every question answered, nothing else. */
export function replySchema(questions: Record<string, Question>): object {
  const keys = Object.keys(questions);
  return { type: 'object', properties: Object.fromEntries(keys.map((k) => [k, schemaOf(questions[k]!)])), required: keys, additionalProperties: false };
}

const clamp01 = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Normalized over `keys`, then pulled toward uniform by `trust`. */
function spread(raw: unknown, keys: string[], trust: number): Record<string, number> {
  const given = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const ps = keys.map((k) => clamp01(given[k]));
  const sum = ps.reduce((a, b) => a + b, 0);
  const even = 1 / Math.max(1, keys.length);
  return Object.fromEntries(keys.map((k, i) => [k, trust * (sum > 0 ? ps[i]! / sum : even) + (1 - trust) * even]));
}

/** The model's JSON as typed answers; a missing answer is an error, so the cascade moves on. */
export function answersOf(raw: Record<string, unknown>, questions: Record<string, Question>, trust = CHAT_TRUST, name = 'model'): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = raw[key] as Record<string, unknown> | undefined;
    if (!a || typeof a !== 'object') throw new DecisionError(`${name} gave no answer for "${key}"`);
    if (q.type === 'noul') {
      out[key] = { type: 'noul', noul: trust * clamp01(a.noul) + (1 - trust) * 0.5 };
    } else if (q.type === 'choice') {
      const probabilities = spread(a.probabilities, Object.keys(q.criteria), trust);
      const choice = Object.entries(probabilities).sort((x, y) => y[1] - x[1])[0]![0];
      out[key] = { type: 'choice', choice, probabilities, confidence: choiceConfidence(probabilities) };
    } else {
      const levels = q.criteria.map((_, i) => String(i));
      const probabilities = spread(a.probabilities, levels, trust);
      const legend = Object.fromEntries(q.criteria.map((c, i) => [String(i), c]));
      const score = levels.reduce((s, l, i) => s + i * probabilities[l]!, 0);
      out[key] = { type: 'score', score, legend, probabilities, confidence: Math.max(...Object.values(probabilities)) };
    }
  }
  return out;
}

/** Some local models wrap JSON in a code fence even when asked not to. */
function parseJson(text: string): Record<string, unknown> {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(body) as Record<string, unknown>;
}

export class ChatEngine implements DecisionEngine {
  readonly name: string;
  private readonly opts: ChatOptions & { timeoutMs: number; trust: number; fetch: typeof fetch };

  constructor(opts: ChatOptions) {
    if (!opts.models.length) throw new DecisionError(`${opts.name} needs a model`);
    this.name = opts.name;
    this.opts = { ...opts, baseUrl: opts.baseUrl.replace(/\/+$/, ''), timeoutMs: opts.timeoutMs ?? 2500, trust: opts.trust ?? CHAT_TRUST, fetch: opts.fetch ?? fetch };
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
    const n = Object.keys(req.questions).length;
    const schema = replySchema(req.questions);
    const object = this.opts.json === 'object';
    try {
      const res = await this.opts.fetch(`${this.opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}), ...this.opts.headers },
        body: JSON.stringify({
          model: this.opts.models[0],
          messages: [
            { role: 'system', content: object ? `${SYSTEM}\nThe reply must match the JSON schema in "reply".` : SYSTEM },
            { role: 'user', content: JSON.stringify({ state: req.state, questions: req.questions, ...(object ? { reply: schema } : {}) }) },
          ],
          temperature: 0,
          max_tokens: Math.min(4000, 120 + 48 * n),
          response_format: object ? { type: 'json_object' } : { type: 'json_schema', json_schema: { name: 'answers', strict: true, schema } },
          ...this.opts.body,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new DecisionError(`${this.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as {
        model?: string;
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new DecisionError(`${this.name} returned no content`);
      return {
        engine: this.name,
        model: json.model ?? this.opts.models[0],
        answers: answersOf(parseJson(content), req.questions, this.opts.trust, this.name),
        latencyMs: performance.now() - t0,
        usage: json.usage
          ? { input_tokens: json.usage.prompt_tokens ?? 0, output_tokens: json.usage.completion_tokens ?? 0, ...(typeof json.usage.cost === 'number' ? { cost: json.usage.cost } : {}) }
          : undefined,
      };
    } catch (err) {
      if (err instanceof DecisionError) throw err;
      throw new DecisionError(timedOut ? `${this.name} timed out after ${this.opts.timeoutMs} ms` : `${this.name} request failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
