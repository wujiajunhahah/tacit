// The harness daemon: a loopback-only HTTP API over the local context ledger, plus the ledger UI.

import {
  HARNESS_PORT,
  HARNESS_VERSION,
  type DecideResponse,
  type HealthResponse,
  type IngestEvent,
  type IngestResponse,
} from '../core';
import { Store, tacitHome, type Env } from './db';
import { chooseEngine, type EngineChoice } from './engine';
import { corsHeaders, hostAllowed, originAllowed } from './guard';
import * as queries from './queries';
import { DecideSchema, IngestEnvelopeSchema, IngestEventSchema, firstIssue } from './schemas';
import { renderUi } from './ui';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface HarnessOptions {
  port?: number;
  home?: string;
  env?: Env;
}

export interface Harness {
  url: string;
  port: number;
  engine: EngineChoice['name'];
  dbPath: string;
  stop(): Promise<void>;
}

interface Ctx {
  store: Store;
  engine: EngineChoice;
  port: number;
}

type Handler = (req: Request, url: URL, ctx: Ctx) => Response | Promise<Response>;

const ROUTES: Record<string, { method: 'GET' | 'POST'; run: Handler }> = {
  '/': { method: 'GET', run: () => ui() },
  '/v1/health': { method: 'GET', run: (_req, _url, ctx) => json(health(ctx)) },
  '/v1/ingest': { method: 'POST', run: ingest },
  '/v1/decide': { method: 'POST', run: decide },
  '/v1/context/current': {
    method: 'GET',
    run: (_req, url, ctx) =>
      json(queries.currentContext(ctx.store, { maxPassages: intParam(url, 'max_passages', 1, 10) })),
  },
  '/v1/trail': {
    method: 'GET',
    run: (_req, url, ctx) => json(queries.trail(ctx.store, intParam(url, 'limit', 1, 200) ?? 20)),
  },
  '/v1/search': {
    method: 'GET',
    run: (_req, url, ctx) =>
      json(queries.search(ctx.store, url.searchParams.get('q') ?? '', intParam(url, 'limit', 1, 50) ?? 10)),
  },
  '/v1/page': { method: 'GET', run: page },
  '/v1/ledger': {
    method: 'GET',
    run: (_req, url, ctx) => json(queries.ledger(ctx.store, intParam(url, 'limit', 1, 500) ?? 50)),
  },
};

export function startHarness(opts: HarnessOptions = {}): Harness {
  const env = opts.env ?? process.env;
  const store = new Store({ home: opts.home ?? tacitHome(env) });
  const engine = chooseEngine(env);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: opts.port ?? (Number(env.TACIT_PORT) || HARNESS_PORT),
      maxRequestBodySize: MAX_BODY_BYTES,
      fetch: (req, srv) => handle(req, { store, engine, port: srv.port ?? 0 }),
    });
  } catch (err) {
    store.close();
    throw err;
  }
  const port = server.port ?? 0;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    engine: engine.name,
    dbPath: store.path,
    async stop() {
      await server.stop(true);
      store.close();
    },
  };
}

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const origin = req.headers.get('origin');
  if (!hostAllowed(req.headers.get('host'), ctx.port)) return problem(403, 'forbidden host');
  if (!originAllowed(origin, ctx.port)) return problem(403, 'forbidden origin');
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  let res: Response;
  try {
    const url = new URL(req.url);
    const route = ROUTES[url.pathname];
    if (!route) res = problem(404, 'not found');
    else if (req.method !== route.method) res = problem(405, `use ${route.method}`, { Allow: `${route.method}, OPTIONS` });
    else res = await route.run(req, url, ctx);
  } catch (err) {
    console.error('[tacit] request failed:', err);
    res = problem(500, 'internal error');
  }
  for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
  return res;
}

function health(ctx: Ctx): HealthResponse {
  const { visits, pages } = ctx.store.counts();
  return {
    ok: true,
    name: 'tacit-harness',
    version: HARNESS_VERSION,
    engine: ctx.engine.name,
    model: ctx.engine.model,
    visits,
    pages,
  };
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
  if (errors.length) Object.assign(res, { rejected: errors.length, errors: errors.slice(0, 5) });
  return json(res);
}

async function decide(req: Request, _url: URL, ctx: Ctx): Promise<Response> {
  const body = await readJson(req);
  if (!body.ok) return problem(400, 'body must be JSON');
  const parsed = DecideSchema.safeParse(body.value);
  if (!parsed.success) return problem(400, firstIssue(parsed.error));
  const res: DecideResponse = await ctx.engine.engine.decide(parsed.data);
  return json(res);
}

function page(_req: Request, url: URL, ctx: Ctx): Response {
  const target = url.searchParams.get('url');
  if (!target) return problem(400, 'url is required');
  const res = queries.page(ctx.store, target);
  return res ? json(res) : problem(404, 'Tacit has no page with that url');
}

async function ui(): Promise<Response> {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(await renderUi(nonce), {
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

function problem(status: number, error: string, headers?: Record<string, string>): Response {
  return json({ ok: false, error }, status, headers);
}

if (import.meta.main) {
  try {
    const harness = startHarness();
    console.log(`Tacit harness listening on ${harness.url} · engine: ${harness.engine} · ledger: ${harness.dbPath}`);
    const shutdown = () => void harness.stop().finally(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error(`Tacit harness could not start: ${err instanceof Error ? err.message : String(err)}`);
    console.error('If another harness is already running, stop it or set TACIT_PORT to another port.');
    process.exit(1);
  }
}
