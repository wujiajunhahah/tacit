import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { DecisionEngine, DecisionRequest } from '../../core';
import { brief, FRESH_MS, GATE_MS } from '../../daemon/brief';
import { Store } from '../../daemon/db';
import { MIN, pageEvent, removeHome, simplePage, tempHome, visitTo } from './helpers';

let home: string;
let store: Store;
beforeEach(() => {
  home = tempHome();
  store = new Store({ home });
});
afterEach(() => {
  store.close();
  removeHome(home);
});

const page = simplePage('https://cei.hkust.edu.hk/erwin', 'Mr Erwin HUANG | HKUST CEI', 'Erwin Huang is an associate professor and senior advisor for entrepreneurship at HKUST.');
const open = () => store.ingest([pageEvent(page, visitTo(page, { searchQuery: 'erwin hkust', arrival: { kind: 'search', searchQuery: 'erwin hkust' }, startedAt: Date.now() - MIN }))]);

/** A decision engine that says yes with probability `p`, after `ms`. */
const judge = (p: number, ms = 0, name = 'jev'): DecisionEngine & { asked: DecisionRequest[] } => {
  const asked: DecisionRequest[] = [];
  return {
    name,
    asked,
    decide: async (req) => {
      asked.push(req);
      if (ms) await Bun.sleep(ms);
      return { engine: name, latencyMs: ms, answers: { relevant: { type: 'noul', noul: p } } };
    },
  };
};

describe('the note for a prompt', () => {
  test('nothing recorded, no note', async () => {
    expect(await brief(store, { prompt: 'what is this page about?' })).toEqual({ inject: false, reason: 'empty' });
  });

  test('asked for without a prompt, or pointed at, the note comes: a few lines, about a hundred tokens', async () => {
    open();
    const asked = await brief(store);
    expect(asked).toMatchObject({ inject: true, reason: 'asked' });
    expect(asked.text).toContain('“Mr Erwin HUANG | HKUST CEI” https://cei.hkust.edu.hk/erwin');
    expect(asked.text).toContain('`tacit now --full`');
    expect(asked.tokens!).toBeLessThan(160);
    const engine = judge(0);
    expect(await brief(store, { prompt: 'who is the person on this page?', engine })).toMatchObject({ inject: true, reason: 'pointing' });
    expect(engine.asked).toEqual([]);
  });

  test('a prompt that does not point goes to the model, which decides within its budget', async () => {
    open();
    expect(await brief(store, { prompt: 'draft three questions for my meeting with him', engine: judge(0.82) })).toMatchObject({ inject: true, reason: 'model', p: 0.82 });
    expect(await brief(store, { prompt: 'write a regex for emails', engine: judge(0.1) })).toMatchObject({ inject: false, reason: 'unrelated', p: 0.1 });
    const t0 = performance.now();
    expect(await brief(store, { prompt: 'draft three questions for my meeting with him', engine: judge(0.9, GATE_MS + 400) })).toEqual({ inject: false, reason: 'unrelated' });
    expect(performance.now() - t0).toBeLessThan(GATE_MS + 300);
    // When every model failed, the code engine's yes means nothing.
    expect(await brief(store, { prompt: 'draft three questions', engine: { name: 'cascade', decide: judge(0.99, 0, 'local').decide } })).toMatchObject({ inject: false });
  });

  test('without a model, only pointing words count; without the browser lately, the model is not asked', async () => {
    open();
    expect(await brief(store, { prompt: 'draft three questions for my meeting with him' })).toEqual({ inject: false, reason: 'unrelated' });
    const engine = judge(0.99);
    const later = Date.now() + FRESH_MS + 60_000;
    store.ingest([{ kind: 'visit', visit: { ...store.recentVisits(1)[0]!, endedAt: Date.now() } }]);
    expect(await brief(store, { prompt: 'draft three questions for my meeting with him', engine, now: later })).toEqual({ inject: false, reason: 'stale' });
    expect(engine.asked).toEqual([]);
    expect(await brief(store, { prompt: 'what does this page say about him?', engine, now: later })).toMatchObject({ inject: true, reason: 'pointing' });
  });
});
