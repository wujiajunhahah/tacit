import { afterEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionRequest } from '../../core';
import { chainText, chooseEngine, isHere, MODELS_FILE } from '../../daemon/engine';
import { saveKey } from '../../daemon/keys';
import { removeHome, tempHome } from './helpers';

const homes: string[] = [];
function home(models?: unknown): string {
  const h = tempHome();
  homes.push(h);
  if (models !== undefined) writeFileSync(join(h, MODELS_FILE), typeof models === 'string' ? models : JSON.stringify(models));
  return h;
}
afterEach(() => homes.splice(0).forEach(removeHome));

const ids = (c: ReturnType<typeof chooseEngine>) => c.decisions.chain.map((e) => e.id);

describe('who decides', () => {
  test('with no key, the code engine alone, on this machine', () => {
    const c = chooseEngine({}, home());
    expect(c.name).toBe('local');
    expect(c.decisions).toEqual({ privacy: 'cloud', chain: [{ id: 'local', label: 'local', here: true }], skipped: [] });
  });

  test('an OpenRouter key alone: Jev leads, another company’s decision model backs it, a chat model settles doubts', () => {
    const c = chooseEngine({ OPENROUTER_API_KEY: 'or-key' }, home());
    expect(ids(c)).toEqual(['openrouter', 'openrouter-decide', 'local']);
    expect(c).toMatchObject({ name: 'openrouter', model: 'typesafe/jev-1.14', remote: ['https://openrouter.ai'] });
    expect(c.decisions.chain[0]).toEqual({ id: 'openrouter', label: 'OpenRouter', model: 'typesafe/jev-1.14', here: false, host: 'openrouter.ai' });
    expect(c.decisions.escalate?.id).toBe('openrouter-llm');
    expect(chainText(c.decisions)).toBe('OpenRouter typesafe/jev-1.14 → OpenRouter inception/mercury-decide → local · unsure → OpenRouter google/gemini-3.1-flash-lite');
  });

  test('both keys: TypeSafe first, the same Jev through OpenRouter if it fails', () => {
    const h = home();
    saveKey(h, 'typesafe', 'ts-key');
    const c = chooseEngine({ OPENROUTER_API_KEY: 'or-key' }, h);
    expect(ids(c)).toEqual(['jev', 'openrouter', 'openrouter-decide', 'local']);
    expect(c.remote).toEqual(['https://api.typesafe.ai', 'https://openrouter.ai']);
  });

  test('a DeepSeek key alone: its chat model, then the code engine; after the decision models when there are some', () => {
    const c = chooseEngine({ DEEPSEEK_API_KEY: 'ds-key' }, home());
    expect(ids(c)).toEqual(['deepseek', 'local']);
    expect(c.remote).toEqual(['https://api.deepseek.com']);
    expect(c.decisions.escalate).toBeUndefined();
    expect(ids(chooseEngine({ DEEPSEEK_API_KEY: 'ds-key', OPENROUTER_API_KEY: 'or-key' }, home()))).toEqual(['openrouter', 'openrouter-decide', 'deepseek', 'local']);
  });

  test('kept local, nothing elsewhere is asked, whatever keys are set', () => {
    const c = chooseEngine({ OPENROUTER_API_KEY: 'or-key', TACIT_PRIVACY: 'local' }, home());
    expect(ids(c)).toEqual(['ollama', 'local']);
    expect(c.decisions.escalate).toBeUndefined();
    expect(c.decisions.skipped).toEqual([
      { id: 'openrouter', reason: 'privacy' },
      { id: 'openrouter-decide', reason: 'privacy' },
    ]);
    expect(c.decisions.chain.every((e) => e.here)).toBe(true);
    expect(c.remote).toEqual([]);
  });

  test('the environment can keep decisions local, never send them out', () => {
    const h = home({ privacy: 'local', reflex: ['openrouter'] });
    expect(ids(chooseEngine({ OPENROUTER_API_KEY: 'or-key', TACIT_PRIVACY: 'cloud' }, h))).toEqual(['local']);
  });

  test('models.json orders the chain, adds servers, and says what it cannot ask', () => {
    const h = home({
      reflex: ['vllm', 'jev'],
      escalate: 'openrouter-llm',
      providers: { vllm: { api: 'chat', label: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1', models: ['qwen3-8b'] } },
    });
    const c = chooseEngine({}, h);
    expect(ids(c)).toEqual(['vllm', 'local']);
    expect(c.decisions.chain[0]).toEqual({ id: 'vllm', label: 'vLLM', model: 'qwen3-8b', here: true });
    expect(c.decisions.skipped).toEqual([
      { id: 'jev', reason: 'no-key' },
      { id: 'openrouter-llm', reason: 'no-key' },
    ]);
  });

  test('a models.json that cannot be used leaves only the code engine, and says why', () => {
    const cases: [unknown, string][] = [
      ['{ "privacy": "local", ', 'is not JSON'],
      [{ reflex: ['nowhere'] }, 'no provider "nowhere"'],
      [{ providers: { mine: { api: 'chat', label: 'Mine', baseUrl: 'ftp://example.com', models: ['m'] } } }, 'providers.mine.baseUrl'],
      [{ privacy: 'public' }, 'models.json.privacy'],
    ];
    for (const [file, problem] of cases) {
      const c = chooseEngine({ OPENROUTER_API_KEY: 'or-key' }, home(file));
      expect(ids(c)).toEqual(['local']);
      expect(c.decisions.privacy).toBe('local');
      expect(c.decisions.problem).toContain(problem);
    }
  });

  test('TYPESAFE_MODEL and TYPESAFE_BASE_URL still point Jev elsewhere', () => {
    const c = chooseEngine({ TYPESAFE_API_KEY: 'ts', TYPESAFE_MODEL: 'jev-1.14', TYPESAFE_BASE_URL: 'http://127.0.0.1:9' }, home());
    expect(c.decisions.chain[0]).toEqual({ id: 'jev', label: 'TypeSafe', model: 'jev-1.14', here: true });
  });

  test('only loopback addresses count as this machine', () => {
    for (const url of ['http://127.0.0.1:11434', 'http://localhost:1234/v1', 'http://[::1]:8000', 'http://models.localhost']) expect(isHere(url), url).toBe(true);
    for (const url of ['https://openrouter.ai/api', 'http://127.0.0.1.example.com', 'http://192.168.1.4:11434', 'http://localhost.example.com']) expect(isHere(url), url).toBe(false);
  });
});

describe('the chain, end to end', () => {
  test('System One first, a chat model for unsure choices, through the routes models.json names', async () => {
    const seen: string[] = [];
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const path = new URL(req.url).pathname;
        const body = (await req.json()) as { model: string };
        seen.push(`${path} ${body.model}`);
        if (path === '/v1/systemone') {
          return Response.json({ model: body.model, answers: { next: { choice: 'a', probabilities: { a: 0.5, b: 0.3, none: 0.2 } } } });
        }
        const content = JSON.stringify({ next: { choice: 'b', probabilities: { a: 0.02, b: 0.96, none: 0.02 } } });
        return Response.json({ model: body.model, choices: [{ message: { content } }] });
      },
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const h = home({
        reflex: ['decider'],
        escalate: 'thinker',
        providers: {
          decider: { api: 'systemone', label: 'Decider', baseUrl: base, models: ['tev1'] },
          thinker: { api: 'chat', label: 'Thinker', baseUrl: `${base}/v1`, models: ['qwen3-8b'] },
        },
      });
      const { engine } = chooseEngine({}, h);
      const req: DecisionRequest = { state: { user_intent: 'x' }, questions: { next: { type: 'choice', instructions: 'next?', criteria: { a: null, b: null, none: null } } } };
      const res = await engine.decide(req);
      expect(seen).toEqual(['/v1/systemone tev1', '/v1/chat/completions qwen3-8b']);
      expect(res.engine).toBe('decider');
      expect(res.escalated).toEqual({ engine: 'thinker', model: 'qwen3-8b', questions: ['next'] });
      expect(res.answers.next).toMatchObject({ choice: 'b' });
    } finally {
      await server.stop(true);
    }
  });
});
