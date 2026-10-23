// The harness daemon: a loopback-only HTTP API over the local context ledger, plus the dashboard.

import { watch } from 'node:fs';
import { dirname } from 'node:path';
import {
  HARNESS_PORT,
  HARNESS_VERSION,
  calibrate,
  type CalibrationResponse,
  type DecideResponse,
  type DeleteResponse,
  harnessProof,
  type HealthResponse,
  type IngestEvent,
  type IngestResponse,
  type BriefResponse,
  type LastDecision,
  type TacitEvent,
} from '../core';
import { carries, harnessToken } from './auth';
import { connectInfo } from './connect';
import { Store, tacitHome, type Env } from './db';
import { chainText, chooseEngine, MODELS_FILE, warmer, type EngineChoice } from './engine';
import { KEYS_FILE } from './keys';
import { modelNetwork } from './network';
import { CONFIRM_DELETE_ALL, CONFIRM_HEADER, corsHeaders, deleteAllowed, hostAllowed, originAllowed } from './guard';
import * as library from './library';
import * as queries from './queries';
import { BriefSchema, DecideSchema, IngestEnvelopeSchema, IngestEventSchema, PagesQuerySchema, firstIssue } from './schemas';
import { brief } from './brief';
import { renderPair } from './pair';
import { renderUi } from './ui';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** Event streams: what one replay sends at most, and how often an idle stream says it is still there. */
const REPLAY = 1000;
const HEARTBEAT_MS = 20_000;
/** Calibration looks at this many of the newest actions. */
const CALIBRATION_WINDOW = 5000;

export interface HarnessOptions {
  port?: number;
  home?: string;
  env?: Env;
  /** No log lines when models.json or a key changes (tests). */
  quiet?: boolean;
}

export interface Harness {
  url: string;
  port: number;
  /** What clients send as `Authorization: Bearer`; also in `<home>/token`. */
  token: string;
  engine: EngineChoice['name'];
  decisions: EngineChoice['decisions'];
  dbPath: string;
  stop(): Promise<void>;
}

interface Ctx {
  store: Store;
  engine: EngineChoice;
  /** The user is browsing: keep the way to the model hosts open. */
  warm: () => void;
  recent: { decision?: LastDecision };
  home: string;
  port: number;
  token: string;
}

type Method = 'GET' | 'POST' | 'DELETE';
type Handler = (req: Request, url: URL, ctx: Ctx) => Response | Promise<Response>;

const ROUTES: Record<string, Partial<Record<Method, Handler>>> = {
  '/': { GET: () => html(renderUi) },
  '/pair': { GET: () => html(async (nonce) => renderPair(nonce)) },
  '/v1/health': { GET: health },
  '/v1/ingest': { POST: ingest },
  '/v1/decide': { POST: decide },
  '/v1/brief': { POST: briefNote },
  '/v1/context/current': {
    GET: (_req, url, ctx) =>
      json(queries.currentContext(ctx.store, { maxPassages: intParam(url, 'max_passages', 1, 10) })),
  },
  '/v1/trail': { GET: (_req, url, ctx) => json(queries.trail(ctx.store, intParam(url, 'limit', 1, 200) ?? 20)) },
  '/v1/search': {
    GET: (_req, url, ctx) =>
      json(queries.search(ctx.store, url.searchParams.get('q') ?? '', intParam(url, 'limit', 1, 50) ?? 10)),
  },
  '/v1/pages': { GET: listPages },
  '/v1/page': { GET: page, DELETE: deletePage },
  '/v1/all': { DELETE: deleteAll },
  '/v1/stats': { GET: (_req, _url, ctx) => json(ctx.store.stats()) },
  '/v1/events': { GET: events },
  '/v1/forgotten': { GET: (_req, url, ctx) => json(ctx.store.forgottenSince(intParam(url, 'since', 0, Number.MAX_SAFE_INTEGER) ?? 0)) },
  '/v1/connect': { GET: (_req, _url, ctx) => json(connectInfo(ctx.engine, ctx.home)) },
  '/v1/calibration': {
    GET: (_req, _url, ctx) => json(calibrate(ctx.store.ledger(CALIBRATION_WINDOW)) satisfies CalibrationResponse),
  },
  '/v1/ledger': { GET: (_req, url, ctx) => json(queries.ledger(ctx.store, intParam(url, 'limit', 1, 500) ?? 50)) },
};

export function startHarness(opts: HarnessOptions = {}): Harness {
  const env = opts.env ?? process.env;
  const store = new Store({ home: opts.home ?? tacitHome(env) });
  const home = dirname(store.path);
  // Model requests survive a laptop's sleep and a changing network (daemon/network.ts).
  const network = modelNetwork(() => engine.remote);
  let engine = chooseEngine(env, home, network.fetch);
  const recent: Ctx['recent'] = {};
  const warmUp = warmer(network.fetch);
  const warm = () => warmUp(engine.remote);
  const token = harnessToken(home);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: opts.port ?? (Number(env.TACIT_PORT) || HARNESS_PORT),
      maxRequestBodySize: MAX_BODY_BYTES,
      // Event streams stay open between events; a heartbeat comes every HEARTBEAT_MS.
      idleTimeout: 60,
      fetch: (req, srv) => handle(req, { store, engine, warm, recent, home, port: srv.port ?? 0, token }),
    });
  } catch (err) {
    store.close();
    throw err;
  }
  warm();
  // A key or models.json changed: the next decision uses it, with no restart.
  let reload: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(home, (_event, file) => {
    if (file !== MODELS_FILE && file !== KEYS_FILE) return;
    clearTimeout(reload);
    reload = setTimeout(() => {
      engine = chooseEngine(env, home, network.fetch);
      warm();
      if (!opts.quiet) logDecisions(engine);
    }, 150);
  });
  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    token,
    get engine() {
      return engine.name;
    },
    get decisions() {
      return engine.decisions;
    },
    dbPath: store.path,
    async stop() {
      network.stop();
      watcher.close();
      clearTimeout(reload);
      await server.stop(true);
      store.close();
    },
  };
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const origin = req.headers.get('origin');
  if (!hostAllowed(req.headers.get('host'), ctx.port)) return problem(403, 'forbidden host');
  if (!originAllowed(origin, ctx.port)) return problem(403, 'forbidden origin');
  if (req.method === 'DELETE' && !deleteAllowed(origin, ctx.port)) return problem(403, 'only the dashboard may delete');
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let res: Response;
  try {
    const url = new URL(req.url);
    const route = ROUTES[url.pathname];
    const run = route?.[req.method as Method];
    // The ledger is the user's: every API call but the health check carries the token.
    if (url.pathname.startsWith('/v1/') && url.pathname !== '/v1/health' && !carries(req, ctx.token)) res = problem(401, 'this harness needs its token: run `bun run pair`');
    else if (!route) res = problem(404, 'not found');
    else if (!run) {
      const allowed = Object.keys(route).join(', ');
      res = problem(405, `use ${allowed}`, { Allow: `${allowed}, OPTIONS` });
    } else res = await run(req, url, ctx);
  } catch (err) {
    console.error('[tacit] request failed:', err);
    res = problem(500, 'internal error');
  }
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

/** Anyone may ask whether this is the user's harness (send ?challenge=); only the token reads the rest. */
async function health(req: Request, url: URL, ctx: Ctx): Promise<Response> {
  const challenge = url.searchParams.get('challenge');
  const proof = challenge && /^[0-9a-f]{32,128}$/.test(challenge) ? await harnessProof(ctx.token, challenge) : undefined;
  const base = { ok: true as const, name: 'tacit-harness' as const, version: HARNESS_VERSION, proof };
  if (!carries(req, ctx.token)) return json({ ...base, authorized: false } satisfies HealthResponse);
  const { visits, pages } = ctx.store.counts();
  return json({ ...base, authorized: true, engine: ctx.engine.name, model: ctx.engine.model, decisions: ctx.engine.decisions, lastDecision: ctx.recent.decision, visits, pages, forgetAt: ctx.store.forgetAt() } satisfies HealthResponse);
}

async function ingest(req: Request, _url: URL, ctx: Ctx): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) return problem(400, 'body must be JSON');
  const envelope = IngestEnvelopeSchema.safeParse(body.value);
  if (!envelope.success) return problem(400, firstIssue(envelope.error));

  const events: IngestEvent[] = [];
  const errors: string[] = [];
  envelope.data.events.forEach((raw, i) => {
    const parsed = IngestEventSchema.safeParse(raw);
    if (parsed.success) events.push(parsed.data);
    else errors.push(`events[${i}] ${firstIssue(parsed.error)}`);
  });
  // Bad events are dropped with a 200: the extension retries any non-2xx batch, so a 4xx would wedge its queue.
  if (errors.length) console.error(`[tacit] rejected ${errors.length} event(s); first: ${errors[0]}`);

  const res: IngestResponse & { rejected?: number; errors?: string[] } = { ok: true, accepted: ctx.store.ingest(events) };
  if (res.accepted) ctx.warm();
  if (errors.length) Object.assign(res, { rejected: errors.length, errors: errors.slice(0, 5) });
  return json(res);
}

/** Server-sent events: what was missed since `Last-Event-ID` (or ?since=), then everything as it happens. */
function events(req: Request, url: URL, ctx: Ctx): Response {
  const asked = Number(req.headers.get('last-event-id') ?? url.searchParams.get('since') ?? Number.NaN);
  const since = Number.isFinite(asked) ? asked : ctx.store.lastEventId();
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          stop();
        }
      };
      const send = (e: TacitEvent) => write(`id: ${e.id}\nevent: ${e.kind}\ndata: ${JSON.stringify(e)}\n\n`);
      write(': tacit events\n\n');
      for (const e of ctx.store.eventsSince(since, REPLAY)) send(e);
      const unfollow = ctx.store.follow(send);
      const beat = setInterval(() => write(': still here\n\n'), HEARTBEAT_MS);
      stop = () => {
        unfollow();
        clearInterval(beat);
      };
    },
    cancel: () => stop(),
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

/** A note about the user's screen for an agent's next prompt, only when that prompt needs one (daemon/brief.ts). */
async function briefNote(req: Request, _url: URL, ctx: Ctx): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) return problem(400, 'body must be JSON');
  const parsed = BriefSchema.safeParse(body.value);
  if (!parsed.success) return problem(400, firstIssue(parsed.error));
  return json(await brief(ctx.store, { prompt: parsed.data.prompt, engine: ctx.engine.engine }) satisfies BriefResponse);
}

async function decide(req: Request, _url: URL, ctx: Ctx): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) return problem(400, 'body must be JSON');
  const parsed = DecideSchema.safeParse(body.value);
  if (!parsed.success) return problem(400, firstIssue(parsed.error));
  const res: DecideResponse = await ctx.engine.engine.decide(parsed.data);
  ctx.recent.decision = { at: Date.now(), engine: res.engine, model: res.model, latencyMs: Math.round(res.latencyMs), fellBack: !!res.fallbackReason, escalated: !!res.escalated };
  return json(res);
}

function listPages(_req: Request, url: URL, ctx: Ctx): Response {
  const parsed = PagesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return problem(400, firstIssue(parsed.error));
  return json(library.pages(ctx.store, parsed.data));
}

function page(_req: Request, url: URL, ctx: Ctx): Response {
  const target = url.searchParams.get('url');
  if (!target) return problem(400, 'url is required');
  const res = library.pageDetail(ctx.store, target);
  return res ? json(res) : problem(404, 'Tacit has no page with that url');
}

function deletePage(_req: Request, url: URL, ctx: Ctx): Response {
  const target = url.searchParams.get('url');
  if (!target) return problem(400, 'url is required');
  const deleted = ctx.store.deletePage(target);
  if (deleted.pages + deleted.visits === 0) return problem(404, 'Tacit has no page with that url');
  return json({ ok: true, deleted } satisfies DeleteResponse);
}

function deleteAll(req: Request, _url: URL, ctx: Ctx): Response {
  if (req.headers.get(CONFIRM_HEADER) !== CONFIRM_DELETE_ALL) {
    return problem(400, `send ${CONFIRM_HEADER}: ${CONFIRM_DELETE_ALL} to delete everything`);
  }
  return json({ ok: true, deleted: ctx.store.deleteAll() } satisfies DeleteResponse);
}

/** The dashboard and the pairing page: static HTML under a nonce CSP. Neither holds data; both fetch it with the token. */
async function html(render: (nonce: string) => Promise<string>): Promise<Response> {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(await render(nonce), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "img-src 'self' data:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}

async function readJson(req: Request): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false };
  }
}

function intParam(url: URL, name: string, min: number, max: number): number | undefined {
  const n = Number.parseInt(url.searchParams.get(name) ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function logDecisions(e: { decisions: EngineChoice['decisions'] }): void {
  console.log(`Decisions: ${chainText(e.decisions)}`);
  if (e.decisions.problem) console.warn(`${e.decisions.problem}. Until it is fixed, the code engine decides, on this machine.`);
}

function problem(status: number, error: string, headers?: Record<string, string>): Response {
  return json({ ok: false, error }, status, headers);
}

if (import.meta.main) {
  try {
    const harness = startHarness();
    console.log(`Tacit harness listening on ${harness.url} · ledger: ${harness.dbPath}`);
    logDecisions(harness);
    const shutdown = () => void harness.stop().finally(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error(`Tacit harness could not start: ${err instanceof Error ? err.message : String(err)}`);
    console.error('If another harness is already running, stop it or set TACIT_PORT to another port.');
    process.exit(1);
  }
}
