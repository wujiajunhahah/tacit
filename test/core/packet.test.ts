import { describe, expect, test } from 'bun:test';
import { buildPacket, canTransition, distinctReads, inferIntent, isHop, rankBlocks, transition, type LedgerEntry, type PageModel } from '../../core';
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
    expect(packet.markdown).toContain('- selected: “Below roughly 400 milliseconds people stop waiting”');
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

describe('what the packet leaves out', () => {
  const page = articlePage();
  const hop = visit({ url: 'https://www.bing.com/ck/a?u=abc', title: '', dwellMs: 900, startedAt: NOW - 2 * MIN, endedAt: NOW - 2 * MIN + 900 });
  const earlierHere = visit({ url: page.url, title: page.title, dwellMs: 40_000, startedAt: NOW - 3 * MIN, endedAt: NOW - 2.5 * MIN });
  const search = visit({ url: 'https://www.bing.com/search?q=latency', title: 'latency - 搜索', searchQuery: 'latency', dwellMs: 8000, startedAt: NOW - 4 * MIN, endedAt: NOW - 3.5 * MIN });
  const current = visit({ url: page.url, title: page.title, startedAt: NOW - MIN });
  const intent = inferIntent([search, earlierHere, hop, current], { now: NOW, currentTitle: page.title });

  test('redirects on the way and this same page are not "before this"', () => {
    expect(isHop(hop)).toBe(true);
    expect(isHop(search)).toBe(false);
    const md = buildPacket({ page, intent, visit: current, trail: [search, earlierHere, hop], ranked: rankBlocks(page.blocks, intent), now: NOW }).markdown;
    const before = md.slice(md.indexOf('## Before this')).split('\n\n')[0]!;
    expect(before).toContain('searched “latency” (www.bing.com)');
    expect(before).not.toContain('bing.com/ck');
    expect(before).not.toContain(page.title);
  });

  test('a passage read twice appears once, with its time added up', () => {
    const r = (text: string, ms: number) => ({ blockId: `b${ms}`, text, ms, via: 'view' as const, at: NOW });
    expect(distinctReads([r('In 2016, Erwin  joined HKUST', 1000), r('in 2016, erwin joined hkust', 1200), r('Another passage', 500)])).toEqual([
      { ...r('In 2016, Erwin  joined HKUST', 1000), ms: 2200 },
      r('Another passage', 500),
    ]);
  });

  test('on a short page the packet does not claim to be smaller than it', () => {
    const tiny: PageModel = { ...page, blocks: [{ id: 'p0', kind: 'para', text: 'A short page.', section: '' }], outline: [] };
    const packet = buildPacket({ page: tiny, intent, visit: current, trail: [search], ranked: rankBlocks(tiny.blocks, intent), now: NOW });
    expect(packet.tokens).toBeGreaterThanOrEqual(packet.fullPageTokens);
    expect(packet.markdown).toContain(`~${packet.tokens} tokens, with how I got here`);
    expect(packet.markdown).not.toContain('instead of');
  });
});

describe('a packet for each kind of page', () => {
  const current = visit({ url: 'https://www.bing.com/search?q=erwin+hkust', title: 'erwin hkust - 搜索', searchQuery: 'erwin hkust', startedAt: NOW - MIN,
    clicks: [{ label: 'Mr Erwin HUANG | HKUST CEI', href: 'https://cei.hkust.edu.hk/erwin', at: NOW - 30_000 }],
    selections: [{ text: 'Erwin Huang - LinkedIn', at: NOW - 40_000 }],
    reads: [{ blockId: 'r1', text: 'Erwin Huang, associate professor and senior advisor (entrepreneurship)', ms: 4000, via: 'view', at: NOW - 50_000 }] });
  const results: PageModel = {
    url: current.url, title: current.title, domain: 'www.bing.com', kind: 'search', outline: [], actions: [], textLength: 400,
    blocks: [
      { id: 'r0', kind: 'item', text: 'Mr Erwin HUANG | HKUST CEI — Associate Professor of Engineering Education', section: '' },
      { id: 'r1', kind: 'item', text: 'Erwin Huang - LinkedIn — Senior Advisor (Entrepreneurship), HKUST', section: '' },
      { id: 'r2', kind: 'item', text: 'HKUST Entrepreneurship Center — Programs and people', section: '' },
    ],
  };

  test('a results page is its results, with the one I opened marked, and what I did in the order I did it', () => {
    const intent = inferIntent([current], { now: NOW, currentTitle: current.title });
    const md = buildPacket({ page: results, intent, visit: current, ranked: rankBlocks(results.blocks, intent), now: NOW }).markdown;
    expect(md).toContain('## Results on this page');
    expect(md).toContain('1. Mr Erwin HUANG | HKUST CEI — Associate Professor of Engineering Education **(I opened this)**');
    expect(md).not.toContain('2. Erwin Huang - LinkedIn — Senior Advisor (Entrepreneurship), HKUST **(I opened this)**');
    const did = md.slice(md.indexOf('## What I did on this page')).split('\n\n')[0]!;
    expect(did.indexOf('read closely')).toBeLessThan(did.indexOf('selected'));
    expect(md).not.toContain('## Page outline');
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
