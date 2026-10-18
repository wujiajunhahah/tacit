import { describe, expect, test } from 'bun:test';
import {
  DecisionError,
  FallbackEngine,
  JevEngine,
  LocalEngine,
  normalizeAnswers,
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
    expect(next.confidence).toBe(next.probabilities[next.choice]!);

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

describe('JevEngine', () => {
  test('sends the System One request shape and normalizes answers', async () => {
    let sent: { url: string; body: Record<string, unknown>; auth: string | null } | undefined;
    const engine = new JevEngine({
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
    const failing = new JevEngine({ apiKey: 'k', fetch: fakeFetch(() => new Response('nope', { status: 401 })) });
    await expect(failing.decide(request)).rejects.toBeInstanceOf(DecisionError);

    const slow = new JevEngine({
      apiKey: 'k',
      timeoutMs: 20,
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        })) as unknown as typeof fetch,
    });
    await expect(slow.decide(request)).rejects.toThrow('timed out');
  });

  test('needs a key', () => {
    expect(() => new JevEngine({ apiKey: '' })).toThrow(DecisionError);
  });

  test('tolerates the older noul field name and missing confidence', () => {
    const answers = normalizeAnswers(
      { a: { type: 'noul', probability: 0.4 }, b: { type: 'choice', probabilities: { x: 0.3, y: 0.7 } } },
      { a: { type: 'noul', instructions: '?' }, b: { type: 'choice', instructions: '?', criteria: { x: null, y: null } } },
    );
    expect(answers.a).toEqual({ type: 'noul', noul: 0.4 });
    expect(answers.b).toEqual({ type: 'choice', choice: 'y', probabilities: { x: 0.3, y: 0.7 }, confidence: 0.7 });
  });
});

describe('FallbackEngine', () => {
  test('answers from the backup when the primary fails, and says why', async () => {
    const broken: DecisionEngine = {
      name: 'jev',
      decide: () => Promise.reject(new DecisionError('Jev timed out after 2500 ms')),
    };
    const res = await new FallbackEngine(broken, new LocalEngine()).decide(request);
    expect(res.engine).toBe('local');
    expect(res.fallbackReason).toContain('timed out');
  });
});
