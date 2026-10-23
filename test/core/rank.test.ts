import { describe, expect, test } from 'bun:test';
import { combinedConfidence, inferIntent, jumpActions, modeFor, rankActions, rankBlocks, siteTerms, topBlocks, type Action, type Block, type Intent } from '../../core';
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

  test('a Chinese article’s references do not outrank its text, though its English citations match', () => {
    const blocks: Block[] = [
      { id: 'b0', kind: 'heading', level: 2, text: '延迟', section: '延迟' },
      { id: 'b1', kind: 'para', text: '人机交互中的决策延迟 decision latency 影响用户是否觉得系统在跟着自己思考。', section: '延迟' },
      { id: 'b2', kind: 'heading', level: 2, text: '参考文献', section: '参考文献' },
      { id: 'b3', kind: 'item', text: 'Card, S. Decision latency in human computer interaction. Human–Computer Interaction, 1983.', section: '参考文献' },
    ];
    const jumps = jumpActions(rankBlocks(blocks, intentFor('decision latency human computer interaction')));
    expect(jumps[0]!.label).toBe('Jump to “延迟”');
  });

  test('jump actions point at the best sections once each', () => {
    const page = articlePage();
    const jumps = jumpActions(rankBlocks(page.blocks, intentFor('latency milliseconds threshold')));
    expect(jumps[0]!.label).toBe('Jump to “Latency: why 400 ms matters”');
    expect(new Set(jumps.map((j) => j.label)).size).toBe(jumps.length);
  });
});

describe('the site’s own name', () => {
  test('comes from the address and the end of the title', () => {
    expect([...siteTerms('35a.hkust.edu.hk', 'Home | HKUST 35th Anniversary')].sort()).toEqual(['35a', 'hkust']);
    expect([...siteTerms('en.wikipedia.org', 'Human–computer interaction - Wikipedia')]).toEqual(['wikipedia']);
    expect([...siteTerms('127.0.0.1', 'Notes')]).toEqual([]);
  });

  test('tells no link on that site apart, while the rest of the intent still does', () => {
    const link = (id: string, label: string, context: string): Action => ({ id, kind: 'link', label, href: `https://hkust.edu.hk/${id}`, context, region: 'main' });
    const actions = [link('admissions', 'Admissions', 'Admissions at HKUST'), link('research', 'Research', 'Research at HKUST'), link('erwin', 'Erwin Huang', 'Erwin Huang, HKUST CEI')];
    const site = siteTerms('hkust.edu.hk', 'About | HKUST');
    expect(rankActions(actions, intentFor('hkust'), 8, site).ranked).toEqual([]);
    expect(rankActions(actions, intentFor('erwin hkust'), 8, site).ranked.map((r) => r.item.id)).toEqual(['erwin']);
    // Off the site, the name is what you are after.
    expect(rankActions(actions, intentFor('hkust'), 8).ranked.length).toBe(3);
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
