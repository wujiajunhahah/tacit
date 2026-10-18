import { describe, expect, test } from 'bun:test';
import { buildPacket, canTransition, inferIntent, rankBlocks, transition, type LedgerEntry } from '../../core';
import { MIN, NOW, articlePage, visit } from './fixtures';

describe('buildPacket', () => {
  const page = articlePage();
  const before = visit({ url: 'https://google.com/search?q=decision+latency', title: 'decision latency - Search', searchQuery: 'decision latency', startedAt: NOW - 3 * MIN, dwellMs: 6000 });
  const current = visit({
    url: page.url,
    title: page.title,
    arrival: { kind: 'search', searchQuery: 'decision latency', fromTitle: 'decision latency - Search', viaLabel: 'Context is the new interface' },
    selections: [{ text: 'Below roughly 400 milliseconds people stop waiting', at: NOW - 10_000 }],
    startedAt: NOW - MIN,
  });
  const intent = inferIntent([before, current], { now: NOW, currentTitle: page.title });
  const packet = buildPacket({ page, intent, visit: current, trail: [before], ranked: rankBlocks(page.blocks, intent), now: NOW });

  test('says what the user wants and how they got here', () => {
    expect(packet.markdown).toContain('# Context: Context is the new interface');
    expect(packet.markdown).toContain("**What I'm trying to do**");
    expect(packet.markdown).toContain('**How I got here:** searched “decision latency”');
    expect(packet.markdown).toContain('> Below roughly 400 milliseconds people stop waiting');
  });

  test('carries the relevant passages, the outline and the trail', () => {
    expect(packet.markdown).toContain('### Latency: why 400 ms matters');
    expect(packet.markdown).toContain('## Page outline');
    expect(packet.markdown).toContain('## Before this');
  });

  test('costs fewer tokens than the whole page', () => {
    expect(packet.tokens).toBeGreaterThan(0);
    expect(packet.fullPageTokens).toBeGreaterThan(0);
    expect(packet.markdown).toContain(`~${packet.tokens} tokens instead of ~${packet.fullPageTokens}`);
  });
});

describe('ledger semantics', () => {
  const entry: LedgerEntry = { id: 'l1', at: NOW, kind: 'jump', label: 'Jump to latency', state: 'suggested', url: 'https://example.com', reason: 'matches latency', undoable: true };

  test('suggested → confirmed → executed → undone', () => {
    const done = transition(transition(entry, 'confirmed'), 'executed');
    expect(done.state).toBe('executed');
    expect(transition(done, 'undone').state).toBe('undone');
  });

  test('nothing executes without being confirmed first', () => {
    expect(canTransition('suggested', 'executed')).toBe(false);
    expect(() => transition(entry, 'executed')).toThrow('Illegal transition');
  });

  test('irreversible actions refuse undo', () => {
    const nav = transition(transition({ ...entry, kind: 'navigate', undoable: false }, 'confirmed'), 'executed');
    expect(() => transition(nav, 'undone')).toThrow('cannot be undone');
  });
});
