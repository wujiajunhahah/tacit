// Runs every agent installed here once, the way `bun run setup` connects it, against a stand-in model on this machine
// and a throwaway ledger: does the note reach the model for a prompt about the page, and stay away from one that is
// not? Nothing leaves the machine, and nothing of the user's is read or changed: each agent gets its own settings in a
// temporary folder. Agents change their hook formats; this is how to find out.
// Usage: bun run agents:check [claude codex gemini opencode]

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addHook, AGENTS, tacitCommand, type AgentSpec } from '../daemon/agents';
import { Store } from '../daemon/db';
import { MIN, pageEvent, simplePage, visitTo } from '../test/daemon/helpers';

const MARK = 'Decision latency, measured';
const ABOUT = 'what is this page about?';
const ELSEWHERE = 'write a haiku about rain';

const only = new Set(process.argv.slice(2));
const root = mkdtempSync(join(tmpdir(), 'tacit-agents-'));
const home = join(root, 'tacit');

// A page as the extension would have kept it, reached from a search.
const store = new Store({ home });
const search = { ...simplePage('https://search.example/?q=decision+latency', 'decision latency - Search', `${MARK} — how fast a typed decision can be`), kind: 'search' as const };
const page = simplePage('https://demo.tacit.test/latency', `${MARK} · Tacit demo`, 'Below roughly 400 milliseconds, a decision feels instant. Decision models answered in about half a second.');
store.ingest([
  pageEvent(search, visitTo(search, { searchQuery: 'decision latency', startedAt: Date.now() - 3 * MIN, endedAt: Date.now() - 2 * MIN, dwellMs: 8000 })),
  pageEvent(page, visitTo(page, { arrival: { kind: 'search', searchQuery: 'decision latency', fromTitle: search.title }, startedAt: Date.now() - MIN })),
]);
store.close();

// The stand-in model: it keeps every request and answers "ok" in each agent's own protocol.
let bodies: string[] = [];
const sse = (events: [string | null, unknown][]) =>
  new Response(events.map(([e, d]) => `${e ? `event: ${e}\n` : ''}data: ${typeof d === 'string' ? d : JSON.stringify(d)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });
const model = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(req) {
    const body = req.method === 'POST' ? await req.text() : '';
    bodies.push(body);
    const json = (() => {
      try {
        return JSON.parse(body) as { stream?: boolean; model?: string };
      } catch {
        return {};
      }
    })();
    const p = new URL(req.url).pathname;
    if (p.endsWith('/messages/count_tokens')) return Response.json({ input_tokens: 1 });
    if (p.endsWith('/messages')) {
      const message = { id: 'msg_1', type: 'message', role: 'assistant', model: json.model ?? 'stand-in', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
      if (!json.stream) return Response.json({ ...message, content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' });
      return sse([
        ['message_start', { type: 'message_start', message }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }],
        ['message_stop', { type: 'message_stop' }],
      ]);
    }
    if (p.endsWith('/responses')) {
      const item = { type: 'message', role: 'assistant', id: 'msg_1', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] };
      const usage = { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 2 };
      return sse([
        ['response.created', { type: 'response.created', response: { id: 'resp_1', status: 'in_progress' } }],
        ['response.output_item.done', { type: 'response.output_item.done', output_index: 0, item }],
        ['response.completed', { type: 'response.completed', response: { id: 'resp_1', status: 'completed', output: [item], usage } }],
      ]);
    }
    if (p.endsWith('/chat/completions')) {
      const base = { id: 'chat_1', object: 'chat.completion.chunk', created: 1, model: json.model ?? 'stand-in' };
      if (!json.stream) return Response.json({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
      return sse([
        [null, { ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] }],
        [null, { ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }],
        [null, '[DONE]'],
      ]);
    }
    if (p.includes(':countTokens')) return Response.json({ totalTokens: 1 });
    if (p.includes('enerateContent')) {
      const chunk = { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
      return p.includes(':stream') ? sse([[null, chunk]]) : Response.json(chunk);
    }
    return new Response('not here', { status: 404 });
  },
});
const base = model.url.origin;

/** Each agent pointed at the stand-in, with its settings in `dir`: what to set, what to write first, what to run. */
const RUNS: Record<AgentSpec['id'], (dir: string) => { env: Record<string, string>; files?: Record<string, string>; argv: (prompt: string) => string[] }> = {
  claude: (dir) => ({
    env: { CLAUDE_CONFIG_DIR: dir, ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: 'stand-in', DISABLE_TELEMETRY: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1' },
    argv: (prompt) => ['claude', '-p', prompt],
  }),
  codex: (dir) => ({
    env: { CODEX_HOME: dir },
    files: { 'config.toml': `model = "stand-in"\nmodel_provider = "stand-in"\n\n[model_providers.stand-in]\nname = "stand-in"\nbase_url = "${base}/v1"\nwire_api = "responses"\n` },
    // Codex runs a new hook only once the user trusts it; this run is not the user's.
    argv: (prompt) => ['codex', 'exec', '--dangerously-bypass-hook-trust', '--skip-git-repo-check', prompt],
  }),
  gemini: (dir) => ({
    env: { GEMINI_CLI_HOME: dir, GEMINI_API_KEY: 'stand-in', GOOGLE_GEMINI_BASE_URL: base },
    files: { '.gemini/settings.json': JSON.stringify({ security: { auth: { selectedType: 'gemini-api-key' } } }) },
    // A model named, so Gemini's router does not first ask for a classification the stand-in cannot give.
    argv: (prompt) => ['gemini', '-p', prompt, '-m', 'gemini-3.5-flash', '--skip-trust'],
  }),
  opencode: (dir) => ({
    env: { XDG_CONFIG_HOME: join(dir, 'config'), XDG_DATA_HOME: join(dir, 'data'), XDG_STATE_HOME: join(dir, 'state'), OPENCODE_DISABLE_AUTOUPDATE: '1' },
    files: {
      'config/opencode/opencode.json': JSON.stringify({
        provider: { 'stand-in': { npm: '@ai-sdk/openai-compatible', name: 'Stand-in', options: { baseURL: `${base}/v1`, apiKey: 'stand-in' }, models: { 'stand-in': { name: 'Stand-in' } } } },
        model: 'stand-in/stand-in',
        autoupdate: false,
        share: 'disabled',
      }),
    },
    argv: (prompt) => ['opencode', 'run', prompt],
  }),
};

async function ask(argv: string[], env: Record<string, string>, cwd: string): Promise<boolean> {
  bodies = [];
  const proc = Bun.spawn(argv, { cwd, env, stdin: 'ignore', stdout: 'ignore', stderr: 'ignore', timeout: 120_000 });
  await proc.exited;
  return bodies.some((b) => b.includes(MARK));
}

const version = (bin: string) => Bun.spawnSync([bin, '--version'], { stdout: 'pipe', stderr: 'ignore' }).stdout.toString().match(/\d+(\.\d+)+/)?.[0] ?? '';

console.log(`Each agent here, once, against a stand-in model at ${base} and a throwaway ledger:\n`);
let failed = 0;
for (const spec of AGENTS) {
  if ((only.size && !only.has(spec.id)) || !Bun.which(spec.bin)) continue;
  const dir = join(root, spec.id);
  const cwd = join(root, `${spec.id}-work`);
  mkdirSync(cwd, { recursive: true });
  const run = RUNS[spec.id](dir);
  for (const [file, text] of Object.entries(run.files ?? {})) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  // The same hook setup writes, into this run's folder.
  const env = { HOME: process.env.HOME ?? '', PATH: process.env.PATH ?? '', TERM: 'dumb', ...run.env };
  const hook = addHook(spec, env, process.env.HOME ?? '', tacitCommand(home));
  const t0 = performance.now();
  const noted = typeof hook === 'string' && (await ask(run.argv(ABOUT), env, cwd));
  const quiet = typeof hook === 'string' && !(await ask(run.argv(ELSEWHERE), env, cwd));
  const ok = noted && quiet;
  if (!ok) failed++;
  const s = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`${ok ? '✓' : '✗'} ${`${spec.name} ${version(spec.bin)}`.padEnd(24)} note for “${ABOUT}”: ${noted ? 'yes' : 'NO'} · none for “${ELSEWHERE}”: ${quiet ? 'yes' : 'NO'} · ${s} s`);
}

model.stop(true);
rmSync(root, { recursive: true, force: true });
if (failed) process.exit(1);
