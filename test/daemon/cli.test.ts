import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Store } from '../../daemon/db';
import { MIN, pageEvent, removeHome, simplePage, tempHome, visitTo } from './helpers';

const CLI = join(import.meta.dir, '../../daemon/cli.ts');
let home: string;

beforeAll(() => {
  home = tempHome();
  const store = new Store({ home });
  const search = { ...simplePage('https://www.bing.com/search?q=erwin+hkust', 'erwin hkust - 搜索', 'Mr Erwin HUANG | HKUST CEI — Associate Professor'), kind: 'search' as const };
  const profile = simplePage('https://cei.hkust.edu.hk/erwin', 'Mr Erwin HUANG | HKUST CEI', 'Erwin Huang is an associate professor and senior advisor for entrepreneurship at HKUST.');
  store.ingest([
    pageEvent(search, visitTo(search, { searchQuery: 'erwin hkust', startedAt: Date.now() - 3 * MIN, endedAt: Date.now() - 2 * MIN, dwellMs: 8000 })),
    pageEvent(profile, visitTo(profile, { arrival: { kind: 'search', searchQuery: 'erwin hkust', fromTitle: 'erwin hkust - 搜索' }, startedAt: Date.now() - MIN })),
  ]);
  store.close();
});
afterAll(() => removeHome(home));

/** Runs `tacit …` against the test ledger; the harness on this machine, if any, cannot prove this ledger's token. */
async function tacit(args: string[], stdin?: string, at = home): Promise<{ out: string; code: number }> {
  const proc = Bun.spawn(['bun', CLI, ...args], { env: { ...process.env, TACIT_HOME: at }, stdin: stdin === undefined ? 'ignore' : new Blob([stdin]), stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(proc.stdout).text();
  return { out, code: await proc.exited };
}

describe('the tacit command', () => {
  test('says what is open in a few lines, and the whole packet when asked', async () => {
    const brief = await tacit(['now']);
    expect(brief.code).toBe(0);
    expect(brief.out).toContain('“Mr Erwin HUANG | HKUST CEI” https://cei.hkust.edu.hk/erwin');
    expect(brief.out).toContain('They got there: searched “erwin hkust”');
    expect(brief.out.split('\n').length).toBeLessThan(9);
    const full = await tacit(['now', '--full']);
    expect(full.out).toContain('# Context: Mr Erwin HUANG | HKUST CEI');
    expect(full.out).toContain('## Before this');
    const json = JSON.parse((await tacit(['now', '--json'])).out) as { visit: { url: string } };
    expect(json.visit.url).toBe('https://cei.hkust.edu.hk/erwin');
  });

  test('finds what was read before, and shows one page', async () => {
    const found = await tacit(['search', 'entrepreneurship']);
    expect(found.out).toContain('Mr Erwin HUANG | HKUST CEI');
    expect((await tacit(['trail', '-n', '5'])).out).toContain('erwin hkust - 搜索');
    expect((await tacit(['page', 'https://cei.hkust.edu.hk/erwin'])).out).toContain('senior advisor for entrepreneurship');
    expect((await tacit(['page', 'https://nowhere.example/'])).code).toBe(1);
  });

  test('before the harness has made a ledger, there is nothing to read, and a hook says nothing', async () => {
    const none = tempHome();
    const now = await tacit(['now'], undefined, none);
    expect(now.out).toContain('Tacit has not recorded any browsing yet');
    expect(now.code).toBe(0);
    expect(await tacit(['hook', 'claude'], JSON.stringify({ prompt: 'what is this page about?' }), none)).toEqual({ out: '', code: 0 });
    removeHome(none);
  });

  test('a prompt hook gets a note only when the prompt points at the screen, and never fails the prompt', async () => {
    const pointing = await tacit(['hook', 'claude'], JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'who is the person on this page?' }));
    expect(pointing.code).toBe(0);
    const out = JSON.parse(pointing.out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(out.hookSpecificOutput.additionalContext).toContain('Mr Erwin HUANG');
    const unrelated = await tacit(['hook', 'claude'], JSON.stringify({ prompt: 'write a regex for emails' }));
    expect(unrelated).toEqual({ out: '', code: 0 });
    expect(await tacit(['hook', 'claude'], 'not json at all')).toEqual({ out: '', code: 0 });
  });
});
