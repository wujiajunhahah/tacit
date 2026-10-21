import { describe, expect, test } from 'bun:test';
import { collectEvidence, describeEvidence, inferIntent, modeFor } from '../../core';
import { MIN, NOW, visit } from './fixtures';

describe('inferIntent', () => {
  test('a fresh search dominates and is confident enough to act', () => {
    const trail = [
      visit({ url: 'https://google.com/search?q=jev+latency', searchQuery: 'jev latency', startedAt: NOW - 2 * MIN }),
      visit({
        url: 'https://example.com/context',
        title: 'Context is the new interface',
        arrival: { kind: 'search', searchQuery: 'jev latency' },
        startedAt: NOW - MIN,
      }),
    ];
    const intent = inferIntent(trail, { now: NOW, currentTitle: 'Context is the new interface' });
    expect(intent.text).toBe('jev latency');
    expect(intent.source).toBe('inferred');
    expect(intent.terms.jev).toBe(1);
    expect(intent.terms.latency).toBe(1);
    expect(modeFor(intent.confidence)).toBe('act');
    expect(intent.evidence[0]!.kind).toBe('search');
  });

  test('browsing without a search stays unsure, so the harness asks', () => {
    const trail = [
      visit({ url: 'https://a.com/1', title: 'Best ramen in Tokyo', dwellMs: 20_000, startedAt: NOW - 6 * MIN, endedAt: NOW - 5 * MIN }),
      visit({ url: 'https://b.com/2', title: 'Fixing a bike chain', dwellMs: 15_000, startedAt: NOW - 4 * MIN, endedAt: NOW - 3 * MIN }),
      visit({ url: 'https://c.com/3', title: 'Learning to sail', dwellMs: 18_000, startedAt: NOW - 2 * MIN, endedAt: NOW - MIN }),
    ];
    const intent = inferIntent(trail, { now: NOW, currentTitle: 'Weekend markets in Lisbon' });
    expect(intent.candidates.length).toBeGreaterThan(2);
    expect(modeFor(intent.confidence)).toBe('ask');
  });

  test('an intent the user picked outranks every inference', () => {
    const trail = [
      visit({ url: 'https://google.com/search?q=mouse+history', searchQuery: 'mouse history', startedAt: NOW - MIN }),
      visit({ url: 'https://example.com/context', statedIntent: { text: 'compare decision latency', at: NOW - 10_000 } }),
    ];
    const intent = inferIntent(trail, { now: NOW });
    expect(intent.text).toBe('compare decision latency');
    expect(intent.source).toBe('stated');
    expect(intent.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('old evidence decays out of the window', () => {
    const trail = [visit({ url: 'https://google.com/search?q=old', searchQuery: 'ancient query', startedAt: NOW - 3 * 60 * MIN })];
    expect(inferIntent(trail, { now: NOW }).source).toBe('none');
  });

  test('selecting text on the page pulls the intent toward it', () => {
    const trail = [
      visit({
        url: 'https://example.com/context',
        title: 'Context is the new interface',
        dwellMs: 30_000,
        selections: [{ text: 'System One model', at: NOW - 5_000 }],
      }),
    ];
    const intent = inferIntent(trail, { now: NOW });
    expect(intent.text).toBe('System One model');
    expect(intent.terms.model).toBe(1);
  });

  test('reading a passage weighs its words but does not rename the goal', () => {
    const passage = 'Below roughly 400 milliseconds people stop waiting and start thinking with a system.';
    const trail = [
      visit({
        url: 'https://example.com/context',
        arrival: { kind: 'search', searchQuery: 'decision latency' },
        startedAt: NOW - 6 * MIN,
        selections: [{ text: 'Below roughly 400 milliseconds people stop waiting', at: NOW - 2 * MIN }],
        reads: [{ blockId: 'b8', text: passage, ms: 12_000, via: 'pointer', at: NOW - MIN }],
      }),
    ];
    const intent = inferIntent(trail, { now: NOW });
    expect(intent.text).toBe('decision latency');
    // A word only the passage has still counts for ranking.
    expect(intent.terms.thinking).toBeGreaterThan(0);
  });

  test('repeated signals merge instead of duplicating', () => {
    const trail = [
      visit({ url: 'https://google.com/search?q=jev', searchQuery: 'jev latency', startedAt: NOW - 2 * MIN }),
      visit({ url: 'https://example.com/x', arrival: { kind: 'search', searchQuery: 'jev latency' }, startedAt: NOW - MIN }),
    ];
    const searches = collectEvidence(trail, { now: NOW }).filter((e) => e.kind === 'search');
    expect(searches).toHaveLength(1);
    expect(searches[0]!.weight).toBeGreaterThan(4);
  });

  test('a newer search replaces an older, more reinforced one', () => {
    const trail = [
      visit({ url: 'https://google.com/search?q=a', searchQuery: 'decision latency', startedAt: NOW - 6 * MIN }),
      visit({ url: 'https://example.com/a', arrival: { kind: 'search', searchQuery: 'decision latency' }, startedAt: NOW - 5 * MIN }),
      visit({ url: 'https://google.com/search?q=b', searchQuery: 'decision latency production', startedAt: NOW - 3 * MIN }),
      visit({ url: 'https://google.com/search?q=c', searchQuery: 'agent context copy paste', startedAt: NOW - 30_000 }),
    ];
    const intent = inferIntent(trail, { now: NOW });
    expect(intent.text).toBe('agent context copy paste');
    expect(modeFor(intent.confidence)).toBe('act');
  });

  test('evidence reads as a sentence', () => {
    expect(describeEvidence({ kind: 'search', text: 'jev latency', at: NOW - 3 * MIN, weight: 1 }, NOW)).toBe(
      'searched “jev latency” · 3 min ago',
    );
  });
});
