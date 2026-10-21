import { describe, expect, test } from 'bun:test';
import { AttentionLedger, buildPacket, clampPointerDwell, inferIntent, rankBlocks } from '../../core';
import { NOW, articlePage, visit } from './fixtures';

const texts: Record<string, string> = {
  b8: 'Below roughly 400 milliseconds people stop waiting and start thinking with a system.',
  b9: 'A reflex that answers in 300 milliseconds can sit inside every click.',
  b13: 'The mouse was demonstrated in 1968 and reached homes with the Macintosh in 1984.',
};
const textOf = (id: string) => texts[id];

describe('AttentionLedger', () => {
  test('time in view is shared between the passages in the reading band', () => {
    const a = new AttentionLedger();
    a.addView(['b8', 'b9'], 8000, NOW);
    expect(a.reads(textOf).map((r) => [r.blockId, r.ms, r.via])).toEqual([
      ['b8', 4000, 'view'],
      ['b9', 4000, 'view'],
    ]);
  });

  test('a passage filling most of the band gets most of the time', () => {
    const a = new AttentionLedger();
    a.addView(['b8', 'b9', 'b13'], 6000, NOW, [300, 60, 0]);
    expect(a.reads(textOf).map((r) => [r.blockId, r.ms])).toEqual([['b8', 5000]]);
  });

  test('nothing counts until it passes its threshold', () => {
    const a = new AttentionLedger();
    a.addView(['b8'], 3000, NOW);
    a.addPointer('b9', 900, NOW);
    expect(a.reads(textOf)).toEqual([]);
  });

  test('the pointer counts more than the viewport, and longer means more important', () => {
    const a = new AttentionLedger();
    a.addView(['b13'], 6000, NOW);
    a.addPointer('b8', 1500, NOW);
    a.addPointer('b9', 6000, NOW);
    expect(a.reads(textOf).map((r) => r.blockId)).toEqual(['b9', 'b8', 'b13']);
  });

  test('the pointer threshold is adjustable', () => {
    const a = new AttentionLedger();
    a.addPointer('b8', 900, NOW);
    expect(a.reads(textOf)).toEqual([]);
    a.configure({ pointerDwellMs: 800 });
    expect(a.reads(textOf)[0]).toMatchObject({ blockId: 'b8', via: 'pointer' });
  });

  test('passages without text are skipped and the list is capped', () => {
    const a = new AttentionLedger({ pointerDwellMs: 100, viewDwellMs: 100, maxReads: 1 });
    a.addPointer('gone', 5000, NOW);
    a.addPointer('b8', 500, NOW);
    a.addPointer('b9', 400, NOW);
    expect(a.reads(textOf).map((r) => r.blockId)).toEqual(['b8']);
  });

  test('clampPointerDwell keeps the setting in range', () => {
    expect(clampPointerDwell(50)).toBe(600);
    expect(clampPointerDwell(1234)).toBe(1200);
    expect(clampPointerDwell(99_000)).toBe(4000);
  });
});

describe('reads as context', () => {
  test('a passage read closely pulls ranking toward its topic without becoming the intent', () => {
    const page = articlePage();
    const v = visit({
      url: page.url,
      title: page.title,
      dwellMs: 40_000,
      reads: [{ blockId: 'b13', text: texts.b13!, ms: 9000, via: 'pointer', at: NOW - 5000 }],
    });
    const intent = inferIntent([v], { now: NOW, currentTitle: page.title });
    expect(intent.text).not.toContain('mouse was demonstrated');
    expect(intent.terms.mouse).toBeGreaterThan(0);
  });

  test('the packet lists what the user read closely, without repeating it below', () => {
    const page = articlePage();
    const v = visit({
      url: page.url,
      title: page.title,
      arrival: { kind: 'search', searchQuery: 'decision latency' },
      reads: [{ blockId: 'b8', text: texts.b8!, ms: 12_000, via: 'pointer', at: NOW - 5000 }],
    });
    const intent = inferIntent([v], { now: NOW, currentTitle: page.title });
    const packet = buildPacket({ page, intent, visit: v, ranked: rankBlocks(page.blocks, intent), now: NOW });
    expect(packet.markdown).toContain('## Passages I read closely');
    expect(packet.markdown).toContain('(12 s) Below roughly 400 milliseconds');
    expect(packet.markdown.split('Below roughly 400 milliseconds').length - 1).toBe(1);
  });
});
