import { describe, expect, test } from 'bun:test';
import { buildIndex, clip, estimateTokens, scoreDoc, searchQueryOf, sameDocument, softmax, tokenize } from '../../core';

describe('tokenize', () => {
  test('drops English stop words and folds plurals', () => {
    expect(tokenize('The agents read the pages for you')).toEqual(['agent', 'read', 'page']);
  });

  test('segments Chinese into words and drops function words', () => {
    const tokens = tokenize('我每天要复制粘贴给agent二十次');
    expect(tokens).toContain('复制');
    expect(tokens).toContain('粘贴');
    expect(tokens).toContain('agent');
    expect(tokens).not.toContain('我');
  });

  test('normalizes full-width characters', () => {
    expect(tokenize('ＪＥＶ')).toEqual(['jev']);
  });
});

describe('text helpers', () => {
  test('clip cuts on a word boundary', () => {
    expect(clip('one two three four five six', 14)).toBe('one two three…');
    expect(clip('  short  ', 20)).toBe('short');
  });

  test('estimateTokens counts CJK per character and Latin per word', () => {
    expect(estimateTokens('复制粘贴')).toBe(4);
    expect(estimateTokens('copy paste every day')).toBe(6);
  });

  test('softmax sums to one and keeps order', () => {
    const p = softmax([3, 1, 0]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(p[0]!).toBeGreaterThan(p[1]!);
    expect(softmax([])).toEqual([]);
  });
});

describe('bm25', () => {
  test('rare matching terms score higher', () => {
    const index = buildIndex([['latency', 'budget'], ['mouse', 'history'], ['latency', 'mouse']]);
    const hit = scoreDoc(index, 0, { budget: 1 });
    const miss = scoreDoc(index, 1, { budget: 1 });
    expect(hit.score).toBeGreaterThan(0);
    expect(miss.score).toBe(0);
    expect(hit.matched[0]![0]).toBe('budget');
  });
});

describe('url signals', () => {
  test('reads queries from common engines and local search pages', () => {
    expect(searchQueryOf('https://www.google.com/search?q=jev+latency')).toBe('jev latency');
    expect(searchQueryOf('https://www.baidu.com/s?wd=上下文')).toBe('上下文');
    expect(searchQueryOf('http://127.0.0.1:7777/search.html?q=context%20harness')).toBe('context harness');
  });

  test('ignores ambiguous params outside search pages', () => {
    expect(searchQueryOf('https://blog.example.com/post?p=1234')).toBeUndefined();
    expect(searchQueryOf('not a url')).toBeUndefined();
  });

  test('sameDocument ignores hash and trailing slash', () => {
    expect(sameDocument('https://a.com/x/#top', 'https://a.com/x')).toBe(true);
    expect(sameDocument('https://a.com/x?q=1', 'https://a.com/x?q=2')).toBe(false);
  });
});
