// Static server for the Tacit demo site: loopback only, no directory listings, no path traversal.
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dir, 'public');
/** The page-script build of Tacit, for trying it without the extension. */
const WEB_RUNTIME = resolve(import.meta.dir, '../dist/tacit-web.js');
const NOT_FOUND = resolve(ROOT, '404.html');
const DEFAULT_PORT = 7777;
/** Set by /try: pages then load Tacit as a page script, so it runs with nothing installed. */
const TRY_COOKIE = 'tacit_try';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

export interface DemoServer {
  url: string;
  port: number;
  stop(): Promise<void>;
}

/** Serves demo/public on 127.0.0.1. Port 0 picks a free port. */
export function startDemo(options: { port?: number } = {}): DemoServer {
  const requested = options.port ?? portFromEnv();
  const server = Bun.serve({ hostname: '127.0.0.1', port: requested, fetch: respond });
  const port = server.port ?? requested;
  return { url: `http://127.0.0.1:${port}/`, port, stop: () => server.stop(true) };
}

function portFromEnv(): number {
  const raw = process.env.TACIT_DEMO_PORT;
  if (!raw) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid TACIT_DEMO_PORT: ${raw}`);
  return port;
}

async function respond(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed\n', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const { pathname } = new URL(req.url);
  if (pathname === '/tacit-web.js') return file(req, WEB_RUNTIME);
  if (pathname === '/try' || pathname === '/try/off') return tryMode(pathname === '/try');
  // X mode: /x/home and /x/<user>/status/<id> are one single-page app, like X.
  if (pathname === '/x' || pathname.startsWith('/x/')) return page(req, resolve(ROOT, 'feed.html'), 200, (s) => s.replace('<head>', '<head>\n  <base href="/" />'));
  const found = await locate(pathname);
  const path = found ?? NOT_FOUND;
  if (extname(path) === '.html') return page(req, path, found ? 200 : 404);
  return new Response(req.method === 'HEAD' ? null : Bun.file(path), {
    status: found ? 200 : 404,
    headers: {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function file(req: Request, path: string): Promise<Response> {
  const exists = await stat(path).then((s) => s.isFile()).catch(() => false);
  if (!exists) return new Response('Not built. Run: bun run build\n', { status: 404 });
  return new Response(req.method === 'HEAD' ? null : Bun.file(path), {
    headers: { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

/** /try turns Tacit on as a page script for this browser; /try/off turns it off. */
function tryMode(on: boolean): Response {
  const cookie = on ? `${TRY_COOKIE}=1; Path=/; SameSite=Lax` : `${TRY_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookie, 'cache-control': 'no-store' } });
}

const TRY_ON = new RegExp(`(?:^|;\\s*)${TRY_COOKIE}=1(?:;|$)`);
const trying = (req: Request) => TRY_ON.test(req.headers.get('cookie') ?? '');

async function page(req: Request, path: string, status = 200, transform: (html: string) => string = (s) => s): Promise<Response> {
  let html = transform(await Bun.file(path).text());
  if (trying(req)) html = html.replace('</head>', '  <script src="/tacit-web.js"></script>\n</head>');
  return new Response(req.method === 'HEAD' ? null : html, {
    status,
    headers: { 'content-type': TYPES['.html']!, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

/** Maps a URL path to a regular file under ROOT, or undefined. Dotfiles and `..` segments never match. */
async function locate(pathname: string): Promise<string | undefined> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel.includes('\0') || rel.split(/[\\/]/).some((part) => part.startsWith('.'))) return undefined;
  const path = resolve(ROOT, `.${rel}`);
  if (!path.startsWith(ROOT + sep)) return undefined;
  const info = await stat(path).catch(() => undefined);
  return info?.isFile() ? path : undefined;
}

if (import.meta.main) {
  const demo = startDemo();
  console.log(`Tacit demo: ${demo.url}`);
}
