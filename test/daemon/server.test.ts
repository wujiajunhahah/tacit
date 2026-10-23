import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BriefResponse,
  CurrentContextResponse,
  DecideRequest,
  DecideResponse,
  HealthResponse,
  LedgerEntry,
  PageResponse,
  SearchHit,
  TrailItem,
} from '../../core';
import { harnessProof, provesToken } from '../../core';
import { MODELS_FILE } from '../../daemon/engine';
import { saveKey } from '../../daemon/keys';
import { MAX_BODY_BYTES, startHarness, type Harness } from '../../daemon/server';
import {
  EXTENSION,
  MIN,
  authed,
  getJson,
  ledgerEntry,
  pageEvent,
  post,
  removeHome,
  seedTrail,
  simplePage,
  tempHome,
  trust,
  visitTo,
} from './helpers';

const DECISION: DecideRequest = {
  state: { focus: 'decision latency', item: 'Below 400 milliseconds people stop waiting: latency matters for decisions.' },
  questions: {
    next: {
      type: 'choice',
      instructions: 'Which action does the user want next?',
      criteria: { 'Jump to latency section': 'Scroll to “Latency: why 400 ms matters”', 'Open mouse history': null, none: null },
    },
    relevant: { type: 'noul', instructions: 'Is this passage relevant to what the user wants?' },
  },
};

let home: string;
let h: Harness;
const seed = seedTrail();

beforeAll(async () => {
  home = tempHome();
  h = startHarness({ port: 0, home, env: {} });
  trust(h);
  const res = await post(h.url, '/v1/ingest', { events: seed.events });
  expect(res.status).toBe(200);
  expect((await res.json()) as unknown).toEqual({ ok: true, accepted: 3 });
});

afterAll(async () => {
  await h.stop();
  removeHome(home);
});

describe('harness API', () => {
  test('health reports the engine and what the ledger holds', async () => {
    const health = await getJson<HealthResponse>(h.url, '/v1/health');
    expect(health).toMatchObject({ ok: true, name: 'tacit-harness', engine: 'local' });
    expect(health.visits).toBeGreaterThanOrEqual(3);
    expect(health.pages).toBeGreaterThanOrEqual(3);
    expect(health.model).toBeUndefined();
  });

  test('current context is the open visit, with a packet for the agent', async () => {
    const ctx = await getJson<CurrentContextResponse>(h.url, '/v1/context/current');
    expect(ctx.visit?.id).toBe(seed.current.id);
    expect(ctx.page?.title).toBe('Context is the new interface');
    expect(ctx.intent.source).toBe('inferred');
    expect(Object.keys(ctx.intent.terms)).toContain('latency');
    expect(ctx.packet?.markdown).toContain('# Context: Context is the new interface');
    expect(ctx.packet?.markdown).toContain('**How I got here:** searched “decision latency”');
    expect(ctx.packet?.markdown).toContain('- selected: “Below roughly 400 milliseconds people stop waiting”');
    expect(ctx.packet?.markdown).toContain('## Before this');
    expect(ctx.packet!.tokens).toBeLessThan(ctx.packet!.fullPageTokens);
  });

  test('an agent gets a note about the screen only for a prompt that needs it', async () => {
    const pointing = (await (await post(h.url, '/v1/brief', { prompt: "what's the main point of this article?" })).json()) as BriefResponse;
    expect(pointing).toMatchObject({ inject: true, reason: 'pointing' });
    expect(pointing.text).toContain('Context is the new interface');
    // This harness decides in code only, so a prompt that does not point gets nothing.
    expect(await (await post(h.url, '/v1/brief', { prompt: 'write a regex for emails' })).json()).toEqual({ inject: false, reason: 'unrelated' });
    expect((await post(h.url, '/v1/brief', { prompt: 42 })).status).toBe(400);
  });

  test('max_passages is accepted and never grows the packet', async () => {
    const one = await getJson<CurrentContextResponse>(h.url, '/v1/context/current?max_passages=1');
    const all = await getJson<CurrentContextResponse>(h.url, '/v1/context/current?max_passages=10');
    expect(one.packet!.tokens).toBeLessThanOrEqual(all.packet!.tokens);
  });

  test('trail is newest first and says how the user arrived', async () => {
    const trail = await getJson<TrailItem[]>(h.url, '/v1/trail?limit=10');
    expect(trail.slice(0, 3).map((t) => t.visit.domain)).toEqual(['example.com', 'google.com', 'zh.example.com']);
    expect(trail[0]!.arrival).toStartWith('searched “decision latency”');
    expect(trail[0]!.arrival).toContain('clicked “Context is the new interface”');
    expect(await getJson<TrailItem[]>(h.url, '/v1/trail?limit=1')).toHaveLength(1);
  });

  test('search finds pages by an English and a Chinese term', async () => {
    const en = await getJson<SearchHit[]>(h.url, `/v1/search?q=${encodeURIComponent('latency')}`);
    expect(en[0]?.url).toBe(seed.article.url);
    expect(en[0]?.snippet.toLowerCase()).toContain('latency');
    expect(en.some((hit) => hit.domain === 'google.com')).toBe(false);

    const zh = await getJson<SearchHit[]>(h.url, `/v1/search?q=${encodeURIComponent('上下文')}`);
    expect(zh[0]?.url).toBe(seed.zh.url);
    expect(zh[0]?.title).toBe('上下文才是新的交互界面');

    const delay = await getJson<SearchHit[]>(h.url, `/v1/search?q=${encodeURIComponent('决策延迟')}`);
    expect(delay[0]?.snippet).toContain('四百毫秒');
    expect(await getJson<SearchHit[]>(h.url, '/v1/search?q=')).toEqual([]);
  });

  test('page returns the model and its visits; unknown urls are 404', async () => {
    const res = await getJson<PageResponse>(h.url, `/v1/page?url=${encodeURIComponent(seed.article.url)}`);
    expect(res.page.blocks.length).toBe(seed.article.blocks.length);
    expect(res.visits.map((v) => v.id)).toEqual([seed.current.id]);
    expect((await fetch(`${h.url}/v1/page?url=${encodeURIComponent('https://nowhere.example/')}`, { headers: authed(h.url) })).status).toBe(404);
    expect((await fetch(`${h.url}/v1/page`, { headers: authed(h.url) })).status).toBe(400);
  });

  test('ledger entries are upserted by id and listed newest first', async () => {
    const t = Date.now();
    await post(h.url, '/v1/ingest', { events: [{ kind: 'ledger', entry: ledgerEntry({ id: 'l1', at: t }) }] });
    await post(h.url, '/v1/ingest', {
      events: [
        { kind: 'ledger', entry: ledgerEntry({ id: 'l1', at: t + 2, state: 'executed' }) },
        { kind: 'ledger', entry: ledgerEntry({ id: 'l2', at: t + 1, kind: 'handoff', label: 'Copied context', undoable: false }) },
      ],
    });
    const ledger = await getJson<LedgerEntry[]>(h.url, '/v1/ledger');
    const mine = ledger.filter((e) => e.id === 'l1' || e.id === 'l2');
    expect(mine.map((e) => [e.id, e.state])).toEqual([
      ['l1', 'executed'],
      ['l2', 'suggested'],
    ]);
  });

  test('every field core defines survives validation, e.g. copy actions and their payload', async () => {
    const page = simplePage('https://docs.example/install', 'Install', 'Run the installer.');
    page.actions = [{ id: 'c1', kind: 'copy', label: 'Copy command', context: 'Install', region: 'main', payload: 'bun add tacit' }];
    const res = await post(h.url, '/v1/ingest', {
      events: [pageEvent(page, visitTo(page, { startedAt: Date.now() - 40 * MIN, endedAt: Date.now() - 39 * MIN }))],
    });
    expect(((await res.json()) as { accepted: number }).accepted).toBe(1);
    const stored = await getJson<PageResponse>(h.url, `/v1/page?url=${encodeURIComponent(page.url)}`);
    expect(stored.page.actions[0]).toEqual(page.actions[0]!);
    expect(stored.visits[0]?.endedAt).toBeNumber();
  });

  test('bad events are dropped without failing the batch', async () => {
    const res = await post(h.url, '/v1/ingest', {
      events: [{ kind: 'visit', visit: { id: 'broken' } }, { kind: 'ledger', entry: ledgerEntry({ id: 'l3' }) }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; rejected: number; errors: string[] };
    expect(body.accepted).toBe(1);
    expect(body.rejected).toBe(1);
    expect(body.errors[0]).toStartWith('events[0] visit.');

    expect((await post(h.url, '/v1/ingest', { events: [{ kind: 'nope' }] })).status).toBe(200);
    expect((await post(h.url, '/v1/ingest', 'not json')).status).toBe(400);
    expect((await post(h.url, '/v1/ingest', { events: 'nope' })).status).toBe(400);
    expect((await fetch(`${h.url}/v1/ingest`, { headers: authed(h.url) })).status).toBe(405);
    expect((await fetch(`${h.url}/v1/nowhere`, { headers: authed(h.url) })).status).toBe(404);
  });

  test('GET / serves the ledger UI under a nonce CSP', async () => {
    const res = await fetch(`${h.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toStartWith('text/html');
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /script-src 'nonce-([a-f0-9]+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(html).toContain('Copy for agent');
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)="https?:/);
  });
});

describe('the token', () => {
  test('every API call but the health check needs it', async () => {
    expect((await fetch(`${h.url}/v1/trail`)).status).toBe(401);
    expect((await fetch(`${h.url}/v1/trail`, { headers: { Authorization: `Bearer ${'x'.repeat(43)}` } })).status).toBe(401);
    expect((await fetch(`${h.url}/v1/ingest`, { method: 'POST', body: '{"events":[]}' })).status).toBe(401);
    expect((await fetch(`${h.url}/v1/trail`, { headers: authed(h.url) })).status).toBe(200);
  });

  test('the health check proves this is the harness, without the token and without data', async () => {
    const challenge = 'a'.repeat(32);
    const open = (await (await fetch(`${h.url}/v1/health?challenge=${challenge}`)).json()) as HealthResponse;
    expect(open).toMatchObject({ ok: true, authorized: false, proof: await harnessProof(h.token, challenge) });
    expect(open.visits).toBeUndefined();
    expect(await getJson<HealthResponse>(h.url, '/v1/health')).toMatchObject({ authorized: true, engine: 'local' });
    expect(await provesToken(h.url, h.token)).toBe(true);
    expect(await provesToken(h.url, 'y'.repeat(43))).toBe(false);
  });

  test('lives in a file only the user can read, and is the same after a restart', async () => {
    expect(statSync(join(home, 'token')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(home, 'token'), 'utf8').trim()).toBe(h.token);
  });

  test('the pairing page holds no data and no token', async () => {
    const res = await fetch(`${h.url}/pair`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await res.text()).not.toContain(h.token);
  });
});

describe('harness security', () => {
  test('a foreign Host header is refused (DNS rebinding)', async () => {
    const res = await fetch(`${h.url}/v1/context/current`, { headers: { Host: `attacker.example:${h.port}` } });
    expect(res.status).toBe(403);
    const ok = await fetch(`${h.url}/v1/health`, { headers: { Host: `localhost:${h.port}` } });
    expect(ok.status).toBe(200);
  });

  test('a web page origin is refused, for writes and reads', async () => {
    const write = await post(h.url, '/v1/ingest', { events: [] }, { Origin: 'https://evil.example' });
    expect(write.status).toBe(403);
    expect(write.headers.get('access-control-allow-origin')).toBeNull();
    const read = await fetch(`${h.url}/v1/context/current`, { headers: { Origin: 'https://evil.example' } });
    expect(read.status).toBe(403);
    const preflight = await fetch(`${h.url}/v1/ingest`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(preflight.status).toBe(403);
  });

  test('the extension origin gets its own origin back as the CORS header, never *', async () => {
    const res = await post(h.url, '/v1/ingest', { events: [] }, { Origin: EXTENSION });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(EXTENSION);
    expect(res.headers.get('vary')).toContain('Origin');

    const preflight = await fetch(`${h.url}/v1/decide`, {
      method: 'OPTIONS',
      headers: { Origin: EXTENSION, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(EXTENSION);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
    expect(preflight.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  test('the ledger UI may post from its own origin but gets no CORS header', async () => {
    const res = await post(h.url, '/v1/ingest', { events: [] }, { Origin: `http://127.0.0.1:${h.port}` });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('bodies over 2 MB are refused', async () => {
    const res = await post(h.url, '/v1/ingest', 'x'.repeat(MAX_BODY_BYTES + 1));
    expect(res.status).toBe(413);
  });
});

describe('decisions', () => {
  test('without a TypeSafe key the local engine answers', async () => {
    const res = await post(h.url, '/v1/decide', DECISION);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DecideResponse;
    expect(body.engine).toBe('local');
    expect(body.answers.next).toMatchObject({ type: 'choice', choice: 'Jump to latency section' });
    expect(body.answers.relevant?.type).toBe('noul');
  });

  test('malformed questions are a 400', async () => {
    const res = await post(h.url, '/v1/decide', { state: {}, questions: { q: { type: 'score', instructions: 'x', criteria: ['one'] } } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('questions.q');
  });

  test('with a TypeSafe key Jev answers, and the local engine covers for it when it fails', async () => {
    let fail = false;
    const seen: { auth?: string | null; body?: { model?: string } } = {};
    const fake = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(req) {
        if (new URL(req.url).pathname !== '/v1/systemone') return new Response('not found', { status: 404 });
        seen.auth = req.headers.get('authorization');
        seen.body = (await req.json()) as { model?: string };
        if (fail) return new Response('overloaded', { status: 503 });
        return Response.json({
          model: 'jev-test',
          answers: { next: { choice: 'Open mouse history', probabilities: { 'Open mouse history': 0.7, none: 0.3 } }, relevant: { noul: 0.93 } },
        });
      },
    });
    const jevHome = tempHome();
    const jh = startHarness({
      port: 0,
      home: jevHome,
      env: { TYPESAFE_API_KEY: 'sk-test', TYPESAFE_BASE_URL: `http://127.0.0.1:${fake.port}`, TYPESAFE_MODEL: 'jev-test' },
    });
    trust(jh);
    try {
      expect(await getJson<HealthResponse>(jh.url, '/v1/health')).toMatchObject({ engine: 'jev', model: 'jev-test' });

      const jev = (await (await post(jh.url, '/v1/decide', DECISION)).json()) as DecideResponse;
      expect(jev).toMatchObject({ engine: 'jev', model: 'jev-test' });
      expect(jev.answers.relevant).toEqual({ type: 'noul', noul: 0.93 });
      expect(jev.fallbackReason).toBeUndefined();
      expect(seen.auth).toBe('Bearer sk-test');
      expect(seen.body?.model).toBe('jev-test');

      fail = true;
      const covered = (await (await post(jh.url, '/v1/decide', DECISION)).json()) as DecideResponse;
      expect(covered.engine).toBe('local');
      expect(covered.fallbackReason).toContain('503');
    } finally {
      await jh.stop();
      await fake.stop(true);
      removeHome(jevHome);
    }
  });

  test('a key set while the harness runs is used without a restart, and so is a models.json', async () => {
    const liveHome = tempHome();
    const live = startHarness({ port: 0, home: liveHome, env: { TYPESAFE_BASE_URL: 'http://127.0.0.1:9' }, quiet: true });
    trust(live);
    const lead = async () => (await getJson<HealthResponse>(live.url, '/v1/health')).decisions?.chain.map((e) => e.id);
    const settle = async (want: string[]) => {
      for (let i = 0; i < 40 && JSON.stringify(await lead()) !== JSON.stringify(want); i++) await Bun.sleep(50);
      return lead();
    };
    try {
      expect(await lead()).toEqual(['local']);
      saveKey(liveHome, 'typesafe', 'sk-test');
      expect(await settle(['jev', 'local'])).toEqual(['jev', 'local']);
      writeFileSync(join(liveHome, MODELS_FILE), JSON.stringify({ privacy: 'local', reflex: [] }));
      expect(await settle(['local'])).toEqual(['local']);
      expect(live.decisions.privacy).toBe('local');
    } finally {
      await live.stop();
      removeHome(liveHome);
    }
  });
});
