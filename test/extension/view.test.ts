import { describe, expect, test } from 'bun:test';
import { inferIntent, type Action, type Block, type DecisionResponse, type Intent, type PageModel } from '../../core';
import { buildDecision, computeView, refineView } from '../../extension/src/view';
import { MIN, NOW, articlePage, visit } from '../core/fixtures';

function searched(query: string): Intent {
  return inferIntent([visit({ url: 'https://google.com/search', searchQuery: query, startedAt: NOW - 30_000 })], { now: NOW });
}

function feedPage(): PageModel {
  const posts: [string, string][] = [
    ['@maya', 'Copy pasting a whole page into the agent every time is the real tax on using AI.'],
    ['@chef', 'Charred corn and miso butter, the best summer dinner.'],
    ['@goals', 'What a finish last night, that late equaliser!'],
    ['@kit', 'Agents should read the page context themselves instead of waiting for me to paste it.'],
    ['@sun', 'Weekend forecast: sunny and warm.'],
    ['@lin', 'My agent finally reads my browser context, no more copy paste.'],
  ];
  const blocks: Block[] = posts.map(([author, text], i) => ({ id: `p:${i}`, kind: 'item', text, section: author }));
  const actions: Action[] = blocks.map((b) => ({ id: `jump:${b.id}`, kind: 'jump', label: `${b.section}: ${b.text.slice(0, 40)}`, context: b.text, region: 'main', targetBlockId: b.id }));
  return { url: 'https://social.example/home', title: 'Home', domain: 'social.example', kind: 'feed', blocks, actions, outline: [], textLength: 400 };
}

describe('computeView on an article', () => {
  test('a clear intent highlights the answer, dims the rest and suggests a jump', () => {
    const view = computeView(articlePage(), searched('latency milliseconds threshold'), false);
    expect(['act', 'suggest']).toContain(view.mode);
    expect(view.highlights.length).toBeGreaterThan(0);
    expect(view.dims.length).toBeGreaterThan(0);
    expect(view.suggestions[0]!.action.label).toBe('Jump to “Latency: why 400 ms matters”');
  });

  test('a guessed intent asks, highlights nothing, and never offers the page title as a choice', () => {
    const page = articlePage();
    const intent = inferIntent([visit({ url: page.url, title: page.title, startedAt: NOW - MIN })], { now: NOW, currentTitle: page.title });
    const view = computeView(page, intent, false);
    expect(view.mode).toBe('ask');
    expect(view.highlights).toEqual([]);
    expect(view.askChoices).not.toContain(page.title);
    expect(view.askChoices).toContain('Latency: why 400 ms matters');
  });

  test('no intent at all stays quiet', () => {
    expect(computeView(articlePage(), inferIntent([], { now: NOW }), false).mode).toBe('quiet');
  });
});

describe('computeView on a feed', () => {
  test('folds runs of unrelated posts and marks the relevant ones', () => {
    const view = computeView(feedPage(), searched('agent page context copy paste'), true);
    expect(view.relevantPosts).toContain('p:3');
    expect(view.foldRuns).toEqual([['p:1', 'p:2'], ['p:4']]);
    expect(view.suggestions.length).toBeGreaterThan(0);
  });

  test('never empties a feed on a topic it does not cover', () => {
    const view = computeView(feedPage(), searched('quarterly tax filing deadline'), true);
    expect(view.foldRuns).toEqual([]);
  });

  test('keeps posts the user already unfolded', () => {
    const view = computeView(feedPage(), searched('agent page context copy paste'), true, new Set(['p:1', 'p:2']));
    expect(view.foldRuns).toEqual([['p:4']]);
  });
});

describe('engine questions', () => {
  test('articles ask one choice question with a "none" escape', () => {
    const page = articlePage();
    const intent = searched('decision latency');
    const d = buildDecision(page, intent, computeView(page, intent, false), false)!;
    const q = d.request.questions.next!;
    expect(q.type).toBe('choice');
    if (q.type !== 'choice') return;
    expect(Object.keys(q.criteria)).toContain('none');
    expect(d.keys.next.size).toBe(Object.keys(q.criteria).length - 1);
    expect((d.request.state as { user_intent: string }).user_intent).toBe('decision latency');
  });

  test("the engine's answer replaces local estimates", () => {
    const page = articlePage();
    const intent = searched('decision latency');
    const view = computeView(page, intent, false);
    const d = buildDecision(page, intent, view, false)!;
    const [linkKey] = [...d.keys.next.entries()].find(([, a]) => a.kind === 'link')!;
    const probabilities = Object.fromEntries([...d.keys.next.keys()].map((k) => [k, k === linkKey ? 0.9 : 0.02]));
    const res: DecisionResponse = {
      engine: 'jev',
      latencyMs: 210,
      answers: { next: { type: 'choice', choice: linkKey, probabilities: { ...probabilities, none: 0.02 }, confidence: 0.88 } },
    };
    const refined = refineView(view, intent, res, d.keys, new Set(), page.actions);
    expect(refined.suggestions[0]!.action.kind).toBe('link');
    expect(refined.engine).toBe('jev');
    expect(refined.mode).toBe('act');
  });

  test('when the engine says nothing here fits, the line offers no step', () => {
    const page = articlePage();
    const intent = searched('decision latency');
    const view = computeView(page, intent, false);
    const d = buildDecision(page, intent, view, false)!;
    const probabilities = Object.fromEntries([...d.keys.next.keys()].map((k) => [k, 0.05]));
    const res: DecisionResponse = { engine: 'jev', latencyMs: 300, answers: { next: { type: 'choice', choice: 'none', probabilities: { ...probabilities, none: 0.6 }, confidence: 0.5 } } };
    const refined = refineView(view, intent, res, d.keys, new Set(), page.actions);
    expect(refined.suggestions).toEqual([]);
    expect(refined.none).toBe(0.6);
    expect(refined.mode).not.toBe('act');
  });

  test('feeds ask a yes/no per post and fold what the engine rules out', () => {
    const page = feedPage();
    const intent = searched('agent page context copy paste');
    const view = computeView(page, intent, true);
    const d = buildDecision(page, intent, view, true)!;
    expect(Object.values(d.request.questions).every((q) => q.type === 'noul')).toBe(true);
    const yes: Record<string, number> = { 'p:0': 0.9, 'p:1': 0.05, 'p:2': 0.1, 'p:3': 0.95, 'p:4': 0.6, 'p:5': 0.92 };
    const answers = Object.fromEntries([...d.keys.posts.entries()].map(([k, id]) => [k, { type: 'noul' as const, noul: yes[id]! }]));
    const refined = refineView(view, intent, { engine: 'jev', latencyMs: 180, answers }, d.keys, new Set(), page.actions);
    expect(refined.foldRuns).toEqual([['p:1', 'p:2']]);
    expect(refined.relevantPosts[0]).toBe('p:3');
    expect(refined.suggestions[0]!.action.targetBlockId).toBe('p:3');
  });
});
