import { describe, expect, test } from 'bun:test';
import { inferIntent, jumpActions, rankActions, rankBlocks, type Block } from '../../core';
import { copyActions, isWall, staysPut, utilityLabels, wordless } from '../../extension/src/extract/generic';
import { NOW, visit } from '../core/fixtures';

const fakeEl = (text: string) => ({ textContent: text }) as unknown as Element;

const blocks: Block[] = [
  { id: 'b0', kind: 'heading', level: 2, text: 'Install', section: 'Install' },
  { id: 'b1', kind: 'para', text: 'Reflex ships as one package with no native dependencies.', section: 'Install' },
  { id: 'b2', kind: 'code', text: '$ npm install @tacit/reflex', section: 'Install' },
  { id: 'b3', kind: 'heading', level: 2, text: 'Quick start', section: 'Quick start' },
  { id: 'b4', kind: 'code', text: '# create a config ...', section: 'Quick start' },
  { id: 'b5', kind: 'heading', level: 2, text: 'License', section: 'License' },
  { id: 'b6', kind: 'para', text: 'MIT licensed. Contributions welcome under the same terms.', section: 'License' },
];
const elements = new Map<string, Element>([
  ['b2', fakeEl('$ npm install @tacit/reflex\n')],
  ['b4', fakeEl('# create a config\n$ npx reflex init\n$ npx reflex run --watch')],
]);

describe('copyActions', () => {
  test('turns code blocks into copy actions without shell prompts', () => {
    const actions = copyActions(blocks, elements);
    expect(actions.map((a) => a.label)).toEqual(['Copy “npm install @tacit/reflex”', 'Copy “npx reflex init”']);
    expect(actions[1]!.payload).toBe('# create a config\nnpx reflex init\nnpx reflex run --watch');
    expect(actions[0]!.context).toContain('Install');
  });

  test('an install intent ranks copying the command first', () => {
    const intent = inferIntent([visit({ url: 'https://google.com/search', searchQuery: 'reflex install', startedAt: NOW - 20_000 })], { now: NOW });
    const ranked = rankBlocks(blocks, intent);
    const ranking = rankActions([...jumpActions(ranked), ...copyActions(blocks, elements)], intent);
    expect(ranking.ranked[0]!.item.kind).toBe('copy');
    expect(ranking.ranked[0]!.item.payload).toBe('npm install @tacit/reflex');
  });
});

describe('sign-in walls', () => {
  const withPassword = (shown: boolean) => ({ querySelectorAll: () => (shown ? [{ checkVisibility: () => true }] : []) }) as unknown as Document;
  const page = (url: string, title: string, paras: number) =>
    ({ url, title, blocks: Array.from({ length: paras }, (_, i) => ({ id: `b${i}`, kind: 'para', text: 'x', section: '' })) }) as unknown as import('../../core').PageModel;

  test('a page that asks for a password, and is about signing in, is not read', () => {
    expect(isWall(withPassword(true), page('https://hk.linkedin.com/signup/cold-join', '注册 | 领英', 3))).toBe(true);
    expect(isWall(withPassword(true), page('https://x.com/i/flow/login', 'Log in to X / X', 30))).toBe(true);
    expect(isWall(withPassword(true), page('https://example.com/account', 'Welcome back', 2))).toBe(true);
  });

  test('a long page with a sign-in box in the corner still is, and so is any page without one', () => {
    expect(isWall(withPassword(true), page('https://forum.example/thread/123', 'How to cancel a fetch - Forum', 20))).toBe(false);
    expect(isWall(withPassword(false), page('https://hk.linkedin.com/signup/cold-join', '注册 | 领英', 3))).toBe(false);
  });
});

describe('links that leave you where you are', () => {
  const link = (attrs: Record<string, string> = {}) => ({ getAttribute: (n: string) => attrs[n] ?? null }) as unknown as Element;
  const doc = (ids: string[] = []) => ({ getElementById: (id: string) => (ids.includes(id) ? {} : null), getElementsByName: () => [] }) as unknown as Document;
  const here = 'https://hkust.edu.hk/about';

  test('the current page, however the page marks it, is not a next step', () => {
    expect(staysPut(link({ 'aria-current': 'page' }), 'https://hkust.edu.hk/about', here, doc())).toBe(true);
    expect(staysPut(link(), 'https://hkust.edu.hk/about/', here, doc())).toBe(true);
    expect(staysPut(link(), 'https://hkust.edu.hk/about#', here, doc())).toBe(true);
    expect(staysPut(link(), 'https://hkust.edu.hk/about#nowhere', here, doc())).toBe(true);
  });

  test('another page, or a section that exists, is', () => {
    expect(staysPut(link(), 'https://hkust.edu.hk/admissions', here, doc())).toBe(false);
    expect(staysPut(link({ 'aria-current': 'false' }), 'https://hkust.edu.hk/admissions', here, doc())).toBe(false);
    expect(staysPut(link(), 'https://hkust.edu.hk/about#our-story', here, doc(['our-story']))).toBe(false);
  });
});

describe('page furniture', () => {
  test('section numbers and footnote marks are not next steps, in any script', () => {
    for (const label of ['4.1', '[12]', '↑', '6.0', '（3）']) expect(wordless(label), label).toBe(true);
    for (const label of ['参考文献', 'Latency', 'Web 2.0', 'Шаг 3']) expect(wordless(label), label).toBe(false);
  });

  test('a short label repeated for many targets is furniture, not a next step', () => {
    const labels = ['编辑', '[编辑]', '编辑', 'Edit', 'edit', '[edit]', 'Reply', 'Reply', 'Decision latency in practice', 'History of the mouse'];
    expect([...utilityLabels(labels)].sort()).toEqual(['edit', '编辑']);
  });

  test('a content link that happens to repeat twice stays', () => {
    expect(utilityLabels(['Install', 'Install', 'Quick start']).size).toBe(0);
  });
});

