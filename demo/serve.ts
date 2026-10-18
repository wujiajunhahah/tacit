// Static server for the Tacit demo site: loopback only, no directory listings, no path traversal.
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dir, 'public');
const NOT_FOUND = resolve(ROOT, '404.html');
const DEFAULT_PORT = 7777;

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
  const found = await locate(new URL(req.url).pathname);
  const path = found ?? NOT_FOUND;
  return new Response(req.method === 'HEAD' ? null : Bun.file(path), {
    status: found ? 200 : 404,
    headers: {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
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
