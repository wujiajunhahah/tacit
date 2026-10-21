import { describe, expect, test } from 'bun:test';
import { STRINGS, ago, detectLocale, duration, getLocale, setLocale, t, tn, type Key } from '../../daemon/ui/i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dashboard strings', () => {
  test('every string exists in both languages with the same placeholders', () => {
    const en = STRINGS.en;
    const zh = STRINGS['zh-CN'];
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Key[]) {
      expect(en[key].trim().length, key).toBeGreaterThan(0);
      expect(zh[key].trim().length, key).toBeGreaterThan(0);
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });

  test('plural keys come in pairs', () => {
    for (const key of Object.keys(STRINGS.en)) {
      if (key.endsWith('.one')) expect(Object.keys(STRINGS.en), key).toContain(key.replace(/\.one$/, '.other'));
    }
  });

  test('the browser language picks the locale unless the user chose one', () => {
    expect(detectLocale(null, 'zh-CN')).toBe('zh-CN');
    expect(detectLocale(null, 'zh-TW')).toBe('zh-CN');
    expect(detectLocale(null, 'en-US')).toBe('en');
    expect(detectLocale('en', 'zh-CN')).toBe('en');
    expect(detectLocale('fr', 'de-DE')).toBe('en');
  });

  test('times, durations and counts read naturally in both languages', () => {
    const before = getLocale();
    const now = 1_800_000_000_000;
    setLocale('en');
    expect([ago(now - 10_000, now), ago(now - 3 * 60_000, now), duration(42_000), duration(95 * 60_000)]).toEqual(['just now', '3 min ago', '42 s', '1 h 35 min']);
    expect([tn('lib.reads', 1), tn('lib.reads', 3)]).toEqual(['1 passage read closely', '3 passages read closely']);
    setLocale('zh-CN');
    expect([ago(now - 10_000, now), ago(now - 3 * 60_000, now), duration(42_000), duration(95 * 60_000)]).toEqual(['刚刚', '3 分钟前', '42 秒', '1 小时 35 分钟']);
    expect(t('nav.library')).toBe('资料库');
    setLocale(before);
  });
});
