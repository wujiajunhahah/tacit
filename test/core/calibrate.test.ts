import { describe, expect, test } from 'bun:test';
import { DEFAULT_THRESHOLDS, calibrate, foldsAllowed, type LedgerEntry } from '../../core';
import { MIN, NOW } from './fixtures';

let n = 0;
function entry(partial: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: `e${++n}`,
    at: NOW - 60 * MIN + n * 1000,
    kind: 'jump',
    label: 'Jump to Latency',
    state: 'executed',
    url: 'https://example.com/a',
    reason: 'matches latency',
    confidence: 0.75,
    undoable: true,
    ...partial,
  };
}

describe('calibrate', () => {
  test('with no history the defaults stand and nothing is claimed', () => {
    const c = calibrate([], DEFAULT_THRESHOLDS, NOW);
    expect(c.thresholds).toEqual(DEFAULT_THRESHOLDS);
    expect(c.notes).toEqual([]);
  });

  test('frequent undos of confident actions make Tacit act less eagerly', () => {
    const entries = [...Array.from({ length: 4 }, () => entry({ state: 'undone' })), ...Array.from({ length: 4 }, () => entry({}))];
    const c = calibrate(entries, DEFAULT_THRESHOLDS, NOW);
    expect(c.thresholds.act).toBeGreaterThan(DEFAULT_THRESHOLDS.act);
    expect(c.thresholds.act).toBeLessThanOrEqual(0.8);
    expect(c.changes[0]).toMatchObject({ kind: 'act-raised', undone: 4, total: 8 });
    expect(c.notes[0]).toContain('you undid 4 of 8');
    expect(c.thresholds.suggest).toBeLessThan(c.thresholds.act);
  });

  test('a 40% undo rate is one step, not two', () => {
    const entries = [...Array.from({ length: 3 }, () => entry({ state: 'undone' })), ...Array.from({ length: 3 }, () => entry({}))];
    expect(calibrate(entries, DEFAULT_THRESHOLDS, NOW).thresholds.act).toBe(0.65);
  });

  test('a long run of kept actions lets Tacit act a little sooner', () => {
    const c = calibrate(Array.from({ length: 14 }, () => entry({})), DEFAULT_THRESHOLDS, NOW);
    expect(c.thresholds.act).toBe(0.55);
    expect(c.changes[0]?.kind).toBe('act-lowered');
  });

  test('a few data points are not enough to move anything', () => {
    const c = calibrate([entry({ state: 'undone' }), entry({ state: 'undone' })], DEFAULT_THRESHOLDS, NOW);
    expect(c.thresholds.act).toBe(DEFAULT_THRESHOLDS.act);
  });

  test('actions taken below the act threshold do not count against it', () => {
    const c = calibrate(Array.from({ length: 8 }, () => entry({ state: 'undone', confidence: 0.4 })), DEFAULT_THRESHOLDS, NOW);
    expect(c.thresholds.act).toBe(DEFAULT_THRESHOLDS.act);
  });

  test('unfolding a site repeatedly turns folds off there, and only there', () => {
    const x = (state: LedgerEntry['state']) => entry({ kind: 'fold', state, url: 'https://x.com/home', undoable: true });
    const c = calibrate([x('dismissed'), x('suggested'), x('dismissed'), entry({ kind: 'fold', state: 'suggested', url: 'https://news.example/' })], DEFAULT_THRESHOLDS, NOW);
    expect(c.folds).toEqual({ 'x.com': false });
    expect(foldsAllowed(c, 'https://x.com/home')).toBe(false);
    expect(foldsAllowed(c, 'https://news.example/today')).toBe(true);
    expect(c.notes.at(-1)).toBe('Stopped folding on x.com: you unfolded 2 of the last 3 times.');
  });

  test('the fold memory fades after a week so Tacit tries again', () => {
    const old = (state: LedgerEntry['state']) => entry({ kind: 'fold', state, url: 'https://x.com/home', at: NOW - 8 * 24 * 60 * MIN });
    expect(calibrate([old('dismissed'), old('dismissed'), old('dismissed')], DEFAULT_THRESHOLDS, NOW).folds).toEqual({});
  });
});
