import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { TacitEvent } from '../../core';
import { startHarness, type Harness } from '../../daemon/server';
import { articlePage, authed, ledgerEntry, pageEvent, post, removeHome, tempHome, trust, visitTo } from './helpers';

let home: string;
let h: Harness;

beforeAll(() => {
  home = tempHome();
  h = startHarness({ port: 0, home, env: {} });
  trust(h);
});

afterAll(async () => {
  await h.stop();
  removeHome(home);
});

const follow = (query = '') => fetch(`${h.url}/v1/events${query}`, { headers: authed(h.url) });

/** Reads server-sent events until `n` have arrived or `ms` have passed. */
async function read(res: Response, n: number, ms = 3000): Promise<TacitEvent[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const out: TacitEvent[] = [];
  const deadline = Date.now() + ms;
  let buf = '';
  while (out.length < n && Date.now() < deadline) {
    const next = await Promise.race([reader.read(), Bun.sleep(deadline - Date.now()).then(() => null)]);
    if (!next || next.done) break;
    buf += dec.decode(next.value, { stream: true });
    for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
      const data = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
      buf = buf.slice(i + 2);
      if (data) out.push(JSON.parse(data.slice(6)) as TacitEvent);
    }
  }
  await reader.cancel();
  return out;
}

describe('the event stream', () => {
  test('needs the token', async () => {
    expect((await fetch(`${h.url}/v1/events`)).status).toBe(401);
  });

  test('pushes what reaches the ledger, as it happens', async () => {
    const res = await follow();
    expect(res.headers.get('content-type')).toStartWith('text/event-stream');
    const page = articlePage();
    const got = read(res, 3);
    await post(h.url, '/v1/ingest', { events: [pageEvent(page, visitTo(page, { id: 'e1' })), { kind: 'ledger', entry: ledgerEntry({ id: 'a1', url: page.url }) }] });
    const events = await got;
    expect(events.map((e) => e.kind)).toEqual(['page', 'visit', 'action']);
    expect(events[1]).toMatchObject({ kind: 'visit', visit: { id: 'e1', url: page.url, arrival: 'unknown', title: page.title } });
    expect(JSON.stringify(events)).not.toContain(page.blocks[2]!.text);
  });

  test('replays what a follower missed', async () => {
    const events = await read(await follow('?since=0'), 3);
    expect(events.map((e) => e.kind)).toEqual(['page', 'visit', 'action']);
    expect(events[0]!.id).toBeLessThan(events[2]!.id);
  });

  test('a deletion is announced without naming the page, and takes its events with it', async () => {
    const page = articlePage();
    const got = read(await follow(), 1);
    await fetch(`${h.url}/v1/page?url=${encodeURIComponent(page.url)}`, { method: 'DELETE', headers: authed(h.url) });
    const [gone] = await got;
    expect(gone).toMatchObject({ kind: 'forgotten', all: false, pages: 1 });
    const replay = await read(await follow('?since=0'), 10, 600);
    expect(replay.map((e) => e.kind)).toEqual(['forgotten']);
    expect(JSON.stringify(replay)).not.toContain(page.url);
  });
});
