import { describe, expect, test } from 'bun:test';
import { inferIntent, jumpActions, rankActions, rankBlocks, type Block } from '../../core';
import { copyActions } from '../../extension/src/extract/generic';
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
