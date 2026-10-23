import { describe, expect, test } from 'bun:test';
import { CHAT_TRUST, ChatEngine, DecisionError, answersOf, replySchema, type DecisionRequest } from '../../core';

const request: DecisionRequest = {
  state: { user_intent: 'decision latency', page: { title: 'Latency', url: 'https://example.com', kind: 'article' } },
  questions: {
    next: { type: 'choice', instructions: 'Which is next?', criteria: { '1. Jump to latency': 'Scroll to the latency section', '2. Open history': null, none: 'None of these' } },
    post_0: { type: 'noul', instructions: { question: 'Is this post about it?', post: 'Latency under 400 ms' } },
    depth: { type: 'score', instructions: 'How relevant?', criteria: ['Unrelated', 'Somewhat', 'Directly'] },
  },
};

const reply = {
  next: { choice: '1. Jump to latency', probabilities: { '1. Jump to latency': 0.8, '2. Open history': 0.15, none: 0.05 } },
  post_0: { noul: 0.9 },
  depth: { probabilities: { '0': 0, '1': 0.2, '2': 0.8 } },
};

function chat(content: string, seen: { url?: string; body?: Record<string, unknown>; headers?: Headers } = {}, status = 200) {
  return ((url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init.body));
    seen.headers = new Headers(init.headers);
    return Promise.resolve(
      status === 200
        ? Response.json({ model: 'openai/gpt-4.1-nano', choices: [{ message: { content } }], usage: { prompt_tokens: 300, completion_tokens: 40 } })
        : new Response('rate limited', { status }),
    );
  }) as unknown as typeof fetch;
}

describe('ChatEngine', () => {
  test('asks for exactly these answers, through a strict JSON schema', async () => {
    const seen: { url?: string; body?: Record<string, unknown>; headers?: Headers } = {};
    const engine = new ChatEngine({
      name: 'openrouter-llm',
      baseUrl: 'https://openrouter.ai/api/v1/',
      apiKey: 'or-key',
      models: ['openai/gpt-4.1-nano', 'mistralai/mistral-small-3.2-24b-instruct'],
      headers: { 'X-OpenRouter-Title': 'Tacit' },
      body: { provider: { zdr: true } },
      fetch: chat(JSON.stringify(reply), seen),
    });
    const res = await engine.decide(request);
    expect(seen.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(seen.headers?.get('authorization')).toBe('Bearer or-key');
    expect(seen.headers?.get('x-openrouter-title')).toBe('Tacit');
    expect(seen.body).toMatchObject({ model: 'openai/gpt-4.1-nano', temperature: 0, provider: { zdr: true } });
    expect(seen.body?.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'answers', strict: true, schema: replySchema(request.questions) } });
    const user = (seen.body?.messages as { role: string; content: string }[])[1]!;
    expect(JSON.parse(user.content)).toEqual({ state: request.state, questions: request.questions });
    expect(res).toMatchObject({ engine: 'openrouter-llm', model: 'openai/gpt-4.1-nano', usage: { input_tokens: 300, output_tokens: 40 } });
  });

  test('an API with JSON mode and no schema (DeepSeek) gets the schema in the request', async () => {
    const seen: { url?: string; body?: Record<string, unknown> } = {};
    const engine = new ChatEngine({ name: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'ds-key', models: ['deepseek-flash'], json: 'object', body: { thinking: { type: 'disabled' } }, fetch: chat(JSON.stringify(reply), seen) });
    const res = await engine.decide(request);
    expect(seen.url).toBe('https://api.deepseek.com/chat/completions');
    expect(seen.body).toMatchObject({ model: 'deepseek-flash', response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
    const [system, user] = seen.body?.messages as { role: string; content: string }[];
    expect(system!.content).toContain('JSON schema in "reply"');
    expect(JSON.parse(user!.content)).toEqual({ state: request.state, questions: request.questions, reply: replySchema(request.questions) });
    expect(res.answers.next).toMatchObject({ type: 'choice', choice: '1. Jump to latency' });
  });

  test('the schema names every option and level, and nothing else', () => {
    const schema = replySchema(request.questions) as { required: string[]; properties: Record<string, { properties: Record<string, { type?: string; enum?: string[]; required?: string[] }> }> };
    expect(schema.required).toEqual(['next', 'post_0', 'depth']);
    expect(schema.properties.next!.properties.choice!.enum).toEqual(['1. Jump to latency', '2. Open history', 'none']);
    expect(schema.properties.depth!.properties.probabilities!.required).toEqual(['0', '1', '2']);
    expect(schema.properties.post_0!.properties.noul).toEqual({ type: 'number' });
  });

  test('a chat model’s certainty is pulled toward an even guess', () => {
    const answers = answersOf(reply, request.questions);
    const next = answers.next!;
    if (next.type !== 'choice') throw new Error('expected choice');
    expect(next.choice).toBe('1. Jump to latency');
    expect(next.probabilities['1. Jump to latency']).toBeCloseTo(CHAT_TRUST * 0.8 + (1 - CHAT_TRUST) / 3, 9);
    expect(Object.values(next.probabilities).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(answers.post_0).toEqual({ type: 'noul', noul: CHAT_TRUST * 0.9 + (1 - CHAT_TRUST) * 0.5 });
    const depth = answers.depth!;
    if (depth.type !== 'score') throw new Error('expected score');
    expect(depth.legend['2']).toBe('Directly');
    expect(depth.score).toBeGreaterThan(1.5);
  });

  test('picks the most probable option, whatever the model named', () => {
    const answers = answersOf({ next: { choice: 'none', probabilities: { '1. Jump to latency': 0.6, '2. Open history': 0.1, none: 0.3 } } }, { next: request.questions.next! });
    expect(answers.next).toMatchObject({ choice: '1. Jump to latency' });
  });

  test('a fenced reply still parses; a missing answer or an HTTP error does not', async () => {
    const fenced = new ChatEngine({ name: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', models: ['qwen3:4b'], fetch: chat('```json\n' + JSON.stringify(reply) + '\n```') });
    expect((await fenced.decide(request)).answers.post_0).toBeDefined();
    const partial = new ChatEngine({ name: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', models: ['qwen3:4b'], fetch: chat(JSON.stringify({ next: reply.next })) });
    await expect(partial.decide(request)).rejects.toThrow('ollama gave no answer for "post_0"');
    const limited = new ChatEngine({ name: 'openrouter-llm', baseUrl: 'https://openrouter.ai/api/v1', models: ['m'], fetch: chat('', {}, 429) });
    await expect(limited.decide(request)).rejects.toBeInstanceOf(DecisionError);
  });

  test('a local server is asked without a key, and a slow one times out', async () => {
    const seen: { headers?: Headers } = {};
    await new ChatEngine({ name: 'vllm', baseUrl: 'http://127.0.0.1:8000/v1', models: ['qwen'], fetch: chat(JSON.stringify(reply), seen) }).decide(request);
    expect(seen.headers?.get('authorization')).toBeNull();
    const slow = new ChatEngine({
      name: 'vllm',
      baseUrl: 'http://127.0.0.1:8000/v1',
      models: ['qwen'],
      timeoutMs: 20,
      fetch: ((_: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as unknown as typeof fetch,
    });
    await expect(slow.decide(request)).rejects.toThrow('vllm timed out after 20 ms');
  });
});
