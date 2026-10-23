import { describe, expect, test } from 'bun:test';
import {
  CascadeEngine,
  choiceConfidence,
  DecisionError,
  LocalEngine,
  normalizeAnswers,
  SystemOneEngine,
  type DecisionEngine,
  type DecisionRequest,
} from '../../core';

const request: DecisionRequest = {
  state: { focus: 'decision latency', item: 'Below 400 milliseconds people stop waiting: latency matters for decisions.' },
  questions: {
    next: {
      type: 'choice',
      instructions: 'Which action does the user want next?',
      criteria: {
        'Jump to latency section': 'Scroll to “Latency: why 400 ms matters”',
        'Open mouse history': 'History of the mouse',
        none: 'None of these',
      },
    },
    relevant: { type: 'noul', instructions: 'Is this passage relevant to what the user wants?' },
    depth: { type: 'score', instructions: 'How relevant is it?', criteria: ['Unrelated', 'Somewhat', 'Directly relevant'] },
  },
};

describe('LocalEngine', () => {
  test('answers every question in Jev shapes', async () => {
    const res = await new LocalEngine().decide(request);
    expect(res.engine).toBe('local');
    const next = res.answers.next!;
    if (next.type !== 'choice') throw new Error('expected choice');
    expect(next.choice).toBe('Jump to latency section');
    expect(Object.values(next.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(next.confidence).toBeCloseTo(choiceConfidence(next.probabilities), 9);

    const relevant = res.answers.relevant!;
    if (relevant.type !== 'noul') throw new Error('expected noul');
    expect(relevant.noul).toBeGreaterThan(0.9);

    const depth = res.answers.depth!;
    if (depth.type !== 'score') throw new Error('expected score');
    expect(depth.score).toBeGreaterThan(1.5);
    expect(depth.legend['2']).toBe('Directly relevant');
  });

  test('"none" wins when no option matches', async () => {
    const res = await new LocalEngine().decide({
      state: { focus: 'ramen recipes' },
      questions: { next: { type: 'choice', instructions: 'Next?', criteria: { 'Open pricing': null, 'Read changelog': null, none: null } } },
    });
    const next = res.answers.next!;
    if (next.type !== 'choice') throw new Error('expected choice');
    expect(next.choice).toBe('none');
  });

  test('an unrelated item gets a low yes-probability', async () => {
    const res = await new LocalEngine().decide({
      state: { focus: 'decision latency', item: 'A recipe for miso ramen with charred corn.' },
      questions: { relevant: { type: 'noul', instructions: 'Relevant?' } },
    });
    const relevant = res.answers.relevant!;
    if (relevant.type !== 'noul') throw new Error('expected noul');
    expect(relevant.noul).toBeLessThan(0.15);
  });
});

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((url: string, init: RequestInit) => Promise.resolve(handler(url, init))) as unknown as typeof fetch;
}

describe('choiceConfidence', () => {
  test('is how far the top option stands above an even guess', () => {
    expect(choiceConfidence({ a: 0.7, b: 0.2, c: 0.1 })).toBeCloseTo(0.55, 9);
    expect(choiceConfidence({ a: 0.5, b: 0.5 })).toBe(0);
    expect(choiceConfidence({ a: 1, b: 0, c: 0 })).toBe(1);
  });
});

describe('SystemOneEngine', () => {
  test('sends the System One request shape and normalizes answers', async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string | null } | undefined;
    const engine = new SystemOneEngine({
      apiKey: 'test-key',
      fetch: fakeFetch((url, init) => {
        sent = { url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get('authorization') };
        return Response.json({
          model: 'jev-1.13.0',
          answers: {
            next: { type: 'choice', choice: 'Jump to latency section', probabilities: { 'Jump to latency section': 0.9, 'Open mouse history': 0.06, none: 0.04 }, confidence: 0.87 },
            relevant: { type: 'noul', noul: 0.93 },
            depth: { type: 'score', score: 1.8, legend: { '0': 'Unrelated', '1': 'Somewhat', '2': 'Directly relevant' }, probabilities: { '0': 0.02, '1': 0.16, '2': 0.82 }, confidence: 0.8 },
          },
          usage: { input_tokens: 120, output_tokens: 20 },
        });
      }),
    });
    const res = await engine.decide(request);
    expect(sent!.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(sent!.auth).toBe('Bearer test-key');
    expect(sent!.body.model).toBe('jev-latest');
    expect(sent!.body.questions).toEqual(request.questions);
    expect(res.engine).toBe('jev');
    expect(res.model).toBe('jev-1.13.0');
    expect(res.answers.relevant).toEqual({ type: 'noul', noul: 0.93 });
    expect(res.usage?.input_tokens).toBe(120);
  });

  test('HTTP errors and timeouts become DecisionErrors', async () => {
    const failing = new SystemOneEngine({ apiKey: 'k', fetch: fakeFetch(() => new Response('nope', { status: 401 })) });
    await expect(failing.decide(request)).rejects.toBeInstanceOf(DecisionError);

    const slow = new SystemOneEngine({
      apiKey: 'k',
      timeoutMs: 20,
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })) as unknown as typeof fetch,
    });
    await expect(slow.decide(request)).rejects.toThrow('timed out');
  });

  test('speaks to any System One server: OpenRouter, or a local one without a key', async () => {
    const sent: { url: string; auth: string | null }[] = [];
    const answer = fakeFetch((url, init) => {
      sent.push({ url, auth: new Headers(init.headers).get('authorization') });
      return Response.json({ answers: { relevant: { noul: 0.8 }, next: { choice: 'Open mouse history', probabilities: { 'Open mouse history': 1 } }, depth: { score: 1, probabilities: { '1': 1 } } } });
    });
    const openrouter = new SystemOneEngine({ name: 'openrouter', apiKey: 'or-key', baseUrl: 'https://openrouter.ai/api/', fetch: answer });
    const ollama = new SystemOneEngine({ name: 'ollama', model: 'tev1', baseUrl: 'http://127.0.0.1:11434', fetch: answer });
    expect((await openrouter.decide(request)).engine).toBe('openrouter');
    const local = await ollama.decide(request);
    expect(local).toMatchObject({ engine: 'ollama', model: 'tev1' });
    expect(sent).toEqual([
      { url: 'https://openrouter.ai/api/v1/systemone', auth: 'Bearer or-key' },
      { url: 'http://127.0.0.1:11434/v1/systemone', auth: null },
    ]);
  });

  test('tolerates the older noul field name and missing confidence', () => {
    const answers = normalizeAnswers(
      { a: { type: 'noul', probability: 0.4 }, b: { type: 'choice', probabilities: { x: 0.3, y: 0.7 } } },
      { a: { type: 'noul', instructions: '?' }, b: { type: 'choice', instructions: '?', criteria: { x: null, y: null } } },
    );
    expect(answers.a).toEqual({ type: 'noul', noul: 0.4 });
    expect(answers.b).toMatchObject({ type: 'choice', choice: 'y', probabilities: { x: 0.3, y: 0.7 } });
    expect((answers.b as { confidence: number }).confidence).toBeCloseTo(0.4, 9);
  });
});

describe('CascadeEngine', () => {
  const broken = (name: string): DecisionEngine => ({ name, decide: () => Promise.reject(new DecisionError(`${name} timed out after 2500 ms`)) });
  /** An engine that answers every choice with one option at a fixed confidence, after `ms`. */
  const sure = (name: string, confidence: number, ms = 0): DecisionEngine => ({
    name,
    decide: async (req) => {
      if (ms) await Bun.sleep(ms);
      return {
        engine: name,
        latencyMs: ms,
        answers: Object.fromEntries(
          Object.entries(req.questions).map(([k, q]) => {
            const options = q.type === 'choice' ? Object.keys(q.criteria) : [];
            return [k, q.type === 'choice' ? { type: 'choice' as const, choice: options[0]!, probabilities: { [options[0]!]: confidence }, confidence } : { type: 'noul' as const, noul: 0.5 }];
          }),
        ),
      };
    },
  });
  const choice: DecisionRequest = { state: {}, questions: { next: { type: 'choice', instructions: 'pick', criteria: { a: null, b: null } } } };

  test('answers from the next engine when one fails, and says why', async () => {
    const res = await new CascadeEngine([broken('jev'), broken('openrouter'), new LocalEngine()]).decide(request);
    expect(res.engine).toBe('local');
    expect(res.fallbackReason).toContain('jev: jev timed out');
    expect(res.fallbackReason).toContain('openrouter: openrouter timed out');
  });

  test('starts the next model alongside a slow one, and the first answer wins', async () => {
    const res = await new CascadeEngine([sure('jev', 0.9, 400), sure('openrouter', 0.9, 10), new LocalEngine()], { hedgeMs: 30 }).decide(choice);
    expect(res.engine).toBe('openrouter');
    expect(res.fallbackReason).toBe('jev: slower than openrouter');
    expect(res.latencyMs).toBeLessThan(300);
    const fast = await new CascadeEngine([sure('jev', 0.9, 5), sure('openrouter', 0.9, 5), new LocalEngine()], { hedgeMs: 200 }).decide(choice);
    expect(fast.engine).toBe('jev');
    expect(fast.fallbackReason).toBeUndefined();
    // The next model started alongside a slow first one, and lost: nothing fell back.
    const overtaken = await new CascadeEngine([sure('jev', 0.9, 60), sure('openrouter', 0.9, 400), new LocalEngine()], { hedgeMs: 20 }).decide(choice);
    expect(overtaken.engine).toBe('jev');
    expect(overtaken.fallbackReason).toBeUndefined();
  });

  test('the code engine answers when the models run out of time', async () => {
    const t0 = performance.now();
    const res = await new CascadeEngine([sure('jev', 0.9, 1000), new LocalEngine()], { budgetMs: 60, escalate: sure('strong', 0.99) }).decide(request);
    expect(res.engine).toBe('local');
    expect(res.fallbackReason).toBe('jev: no answer within 60 ms');
    expect(performance.now() - t0).toBeLessThan(400);
    // Every model failed, so the strong one is not tried either.
    expect(res.escalated).toBeUndefined();
  });

  test('asks a stronger model about unsure choices, and keeps its answer only when it is surer', async () => {
    const escalated = await new CascadeEngine([sure('jev', 0.4)], { escalate: sure('strong', 0.9) }).decide(choice);
    expect(escalated.answers.next).toMatchObject({ confidence: 0.9 });
    expect(escalated.escalated).toEqual({ engine: 'strong', model: undefined, questions: ['next'] });
    const kept = await new CascadeEngine([sure('jev', 0.4)], { escalate: sure('weaker', 0.3) }).decide(choice);
    expect(kept.answers.next).toMatchObject({ confidence: 0.4 });
    expect(kept.escalated).toBeUndefined();
    const confident = await new CascadeEngine([sure('jev', 0.8)], { escalate: broken('strong') }).decide(choice);
    expect(confident.answers.next).toMatchObject({ confidence: 0.8 });
  });

  test('a strong model that is too slow leaves the first answer standing, within the budget', async () => {
    const t0 = performance.now();
    const res = await new CascadeEngine([sure('jev', 0.4, 5), new LocalEngine()], { escalate: sure('strong', 0.99, 1000), budgetMs: 300 }).decide(choice);
    expect(res).toMatchObject({ engine: 'jev', answers: { next: { confidence: 0.4 } } });
    expect(res.escalated).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(600);
  });

  test('never escalates a batch of yes/no questions', async () => {
    let asked = 0;
    const strong: DecisionEngine = { name: 'strong', decide: async (r) => (asked++, sure('strong', 0.9).decide(r)) };
    await new CascadeEngine([sure('jev', 0.4)], { escalate: strong }).decide({ state: {}, questions: { post_0: { type: 'noul', instructions: 'is it?' } } });
    expect(asked).toBe(0);
  });
});
