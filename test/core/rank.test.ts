import { describe, expect, test } from 'bun:test';
import { combinedConfidence, inferIntent, jumpActions, modeFor, rankActions, rankBlocks, topBlocks, type Intent } from '../../core';
import { NOW, articlePage, visit } from './fixtures';

function intentFor(query: string): Intent {
  return inferIntent([visit({ url: 'https://google.com/search', searchQuery: query, startedAt: NOW - 30_000 })], { now: NOW });
}

describe('rankBlocks', () => {
  test('the section that answers the intent ranks first', () => {
    const page = articlePage();
    const best = topBlocks(rankBlocks(page.blocks, intentFor('decision latency milliseconds')), 2);
    expect(best[0]!.item.section).toBe('Latency: why 400 ms matters');
    expect(best[0]!.reasons[0]).toContain('latency');
  });

  test('keeps page order and scores nothing without an intent', () => {
    const page = articlePage();
    const ranked = rankBlocks(page.blocks, inferIntent([], { now: NOW }));
    expect(ranked.map((r) => r.item.id)).toEqual(page.blocks.map((b) => b.id));
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });

  test('jump actions point at the best sections once each', () => {
    const page = articlePage();
    const jumps = jumpActions(rankBlocks(page.blocks, intentFor('latency milliseconds threshold')));
    expect(jumps[0]!.label).toBe('Jump to “Latency: why 400 ms matters”');
    expect(new Set(jumps.map((j) => j.label)).size).toBe(jumps.length);
  });
});

describe('rankActions', () => {
  test('a matching link in the main content wins clearly', () => {
    const page = articlePage();
    const intent = intentFor('decision latency');
    const jumps = jumpActions(rankBlocks(page.blocks, intent));
    const ranking = rankActions([...jumps, ...page.actions], intent);
    expect(ranking.ranked[0]!.item.kind).toBe('jump');
    expect(ranking.ranked.map((r) => r.item.id)).toContain('a3');
    expect(ranking.none).toBeLessThan(0.2);
  });

  test('nothing relevant means "none of these" wins and the harness asks', () => {
    const page = articlePage();
    const ranking = rankActions(page.actions, intentFor('ramen recipes tokyo'));
    expect(ranking.ranked).toHaveLength(0);
    expect(ranking.none).toBe(1);
    expect(modeFor(ranking.confidence)).toBe('ask');
  });

  test('navigation chrome is penalised against the same words in main content', () => {
    const intent = intentFor('pricing plans');
    const ranking = rankActions(
      [
        { id: 'n', kind: 'link', label: 'Pricing plans', context: '', region: 'nav' },
        { id: 'm', kind: 'link', label: 'Pricing plans', context: '', region: 'main' },
      ],
      intent,
    );
    expect(ranking.ranked[0]!.item.id).toBe('m');
  });
});

describe('policy', () => {
  test('two close candidates make the harness suggest instead of act', () => {
    const page = articlePage();
    const intent = intentFor('decision latency');
    const ranking = rankActions([...jumpActions(rankBlocks(page.blocks, intent)), ...page.actions], intent);
    expect(ranking.ranked).toHaveLength(2);
    expect(modeFor(combinedConfidence(intent.confidence, ranking.confidence))).toBe('suggest');
  });

  test('one clear action on a clear intent is ready to act', () => {
    const intent = intentFor('mouse history 1968');
    const ranking = rankActions(articlePage().actions, intent);
    expect(ranking.ranked[0]!.item.id).toBe('a4');
    expect(modeFor(combinedConfidence(intent.confidence, ranking.confidence))).toBe('act');
  });
});
