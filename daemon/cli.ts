#!/usr/bin/env bun
// tacit: the user's browsing context, for people and for any agent that can run a command (Codex, Gemini CLI,
// OpenCode, Cursor, Aider, Claude Code…). It reads the local ledger itself, so it works with the harness stopped,
// and it says little by default: a few lines, then where to get more, since every token an agent reads costs.
//
//   tacit                      what the user has open now, in a few lines
//   tacit now --full           the same page as context for an agent (what ⌥⇧C copies)
//   tacit intent               what they seem to be after, and why Tacit thinks so
//   tacit trail [-n 10]        where they have been, newest first
//   tacit search <words> [-n 8]  what they read before, in any language
//   tacit page <url> [--chars 12000]  one page in full, with what they read closely
//   tacit brief [--prompt …]   a note for an agent's next prompt, only if the prompt needs one (the prompt may come on stdin)
//   tacit hook <agent>         the same, in the format an agent's prompt hook expects (claude, codex, gemini, cline)
//   tacit status               the harness, the ledger, who decides
// Add --json to any of them for the data instead of the text.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HARNESS_ORIGIN, authHeader, provesToken, type BriefResponse, type HealthResponse } from '../core';
import { readToken } from './auth';
import { brief } from './brief';
import { MCP_PATH } from './connect';
import { Store, tacitHome } from './db';
import { chainText, chooseEngine } from './engine';
import { EMPTY_LEDGER, formatBrief, formatContext, formatIntent, formatPage, formatSearch, formatTrail } from './format';
import { hookInput, hookOutput, HOOK_AGENTS, type HookAgent } from './hooks';
import * as queries from './queries';
import { tilde } from './units';

const USAGE = `tacit: what you are reading in your browser, for you and your agents.

  tacit                        what is open now, in a few lines
  tacit now --full             this page as context for an agent
  tacit intent                 what you seem to be after, and why
  tacit trail [-n 10]          where you have been, newest first
  tacit search <words> [-n 8]  what you read before, in any language
  tacit page <url>             one page in full
  tacit brief [--prompt …]     a note for an agent's next prompt, only if it needs one
  tacit hook <agent>           the same, for a prompt hook: ${HOOK_AGENTS.join(', ')}
  tacit status                 the harness, the ledger, who decides

Add --json for data instead of text.`;

interface Args {
  command: string;
  rest: string[];
  json: boolean;
  full: boolean;
  limit?: number;
  chars?: number;
  prompt?: string;
}

function parse(argv: string[]): Args {
  const out: Args = { command: 'now', rest: [], json: false, full: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') out.json = true;
    else if (a === '--full') out.full = true;
    else if (a === '-n' || a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--chars') out.chars = Number(argv[++i]);
    else if (a === '--prompt') out.prompt = argv[++i];
    else if (a === '-h' || a === '--help') positional.unshift('help');
    else positional.push(a);
  }
  if (positional.length) out.command = positional.shift()!;
  out.rest = positional;
  return out;
}

const clamp = (n: number | undefined, lo: number, hi: number, fallback: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n!))) : fallback);

function say(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}

function fail(text: string): never {
  process.stderr.write(`${text}\n`);
  process.exit(1);
}

async function stdinText(): Promise<string> {
  return process.stdin.isTTY ? '' : (await Bun.stdin.text()).trim();
}

/** The user's own harness, if it is up: it must prove it holds the token before it gets it. */
async function harness(home: string): Promise<string | null> {
  const token = readToken(home);
  return token && (await provesToken(HARNESS_ORIGIN, token, 600)) ? token : null;
}

/** Why the harness did not answer. Agents such as Codex run commands in a sandbox that refuses local connections. */
async function absent(): Promise<string> {
  try {
    await fetch(`${HARNESS_ORIGIN}/v1/health`, { signal: AbortSignal.timeout(600) });
    return `something at ${HARNESS_ORIGIN} is not the harness for this ledger`;
  } catch (err) {
    return (err as { code?: string }).code === 'FailedToOpenSocket'
      ? `not reachable from here (a sandbox may refuse connections to ${HARNESS_ORIGIN}); reading the ledger directly`
      : 'not running (start it in the tacit folder: bun run harness)';
  }
}

/** The ledger, read-only: an agent's sandbox may forbid writing to it, and nothing here needs to. */
function openLedger(home: string, quiet: boolean): Store | null {
  const path = join(home, 'tacit.db');
  if (!existsSync(path)) return null;
  try {
    return new Store({ home, readonly: true });
  } catch (err) {
    if (quiet) return null;
    fail(`Tacit cannot read ${tilde(path)}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * The note for a prompt. The running harness answers it best: it holds a warm connection to the decision model, so the
 * yes/no takes a fraction of a second. Without it, only words that point at the screen count.
 */
async function note(store: Store | null, home: string, prompt: string | undefined): Promise<BriefResponse> {
  const token = await harness(home);
  if (token) {
    try {
      const res = await fetch(`${HARNESS_ORIGIN}/v1/brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) return (await res.json()) as BriefResponse;
    } catch {
      // Fall through to the ledger.
    }
  }
  return store ? brief(store, { prompt }) : { inject: false, reason: 'empty' };
}

/** What the user has read, out of the ledger. */
function read(store: Store, args: Args): void {
  const empty = store.counts().visits === 0;
  switch (args.command) {
    case 'now': {
      const ctx = queries.currentContext(store, { maxPassages: args.limit ? clamp(args.limit, 1, 10, 5) : undefined });
      if (args.json) return say(JSON.stringify({ visit: ctx.visit, intent: ctx.intent, packet: ctx.packet }, null, 2));
      return say(empty ? EMPTY_LEDGER : args.full ? formatContext(ctx) : formatBrief(ctx));
    }
    case 'intent': {
      const intent = queries.intent(store);
      return say(args.json ? JSON.stringify(intent, null, 2) : empty ? EMPTY_LEDGER : formatIntent(intent));
    }
    case 'trail': {
      const items = queries.trail(store, clamp(args.limit, 1, 50, 10));
      return say(args.json ? JSON.stringify(items, null, 2) : formatTrail(items));
    }
    case 'search': {
      const query = args.rest.join(' ').trim();
      if (!query) fail('Usage: tacit search <words>');
      const hits = queries.search(store, query, clamp(args.limit, 1, 20, 8));
      return say(args.json ? JSON.stringify(hits, null, 2) : empty ? EMPTY_LEDGER : formatSearch(query, hits, Date.now(), 'cli'));
    }
    case 'page': {
      const url = args.rest[0];
      if (!url) fail('Usage: tacit page <url>');
      const res = queries.page(store, url);
      if (!res) fail(`Tacit has no copy of ${url}. Only pages opened with the extension on are kept; try \`tacit search <words>\` or \`tacit trail\`.`);
      return say(args.json ? JSON.stringify(res, null, 2) : formatPage(res, clamp(args.chars, 500, 200_000, 12_000), Date.now(), 'cli'));
    }
  }
}

const READS = ['now', 'intent', 'trail', 'search', 'page'];

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  if (args.command === 'help') return say(USAGE);
  const home = tacitHome();
  // Before the harness has made a ledger there is nothing to read; a hook says nothing, whatever went wrong.
  const store = openLedger(home, args.command === 'hook');
  try {
    switch (args.command) {
      case 'brief': {
        const prompt = args.prompt ?? (await stdinText());
        const res = await note(store, home, prompt || undefined);
        if (args.json) return say(JSON.stringify(res, null, 2));
        if (res.inject && res.text) say(res.text);
        return;
      }
      case 'hook': {
        const agent = args.rest[0] as HookAgent | undefined;
        if (!agent || !HOOK_AGENTS.includes(agent)) fail(`Usage: tacit hook <${HOOK_AGENTS.join('|')}>`);
        // A hook must never stand in the way of a prompt: whatever happens, it exits 0, with a note or without one.
        let text: string | undefined;
        try {
          const res = await note(store, home, hookInput(agent, await stdinText()));
          if (res.inject) text = res.text;
        } catch {
          // No note.
        }
        const out = hookOutput(agent, text);
        if (out) say(out);
        return;
      }
      case 'status': {
        const token = await harness(home);
        let health: HealthResponse | null = null;
        if (token) health = (await (await fetch(`${HARNESS_ORIGIN}/v1/health`, { headers: authHeader(token), signal: AbortSignal.timeout(1000) })).json()) as HealthResponse;
        const counts = store?.counts() ?? { pages: 0, visits: 0 };
        const decisions = health?.decisions ?? chooseEngine(process.env, home).decisions;
        const status = {
          harness: health ? HARNESS_ORIGIN : null,
          ledger: { path: tilde(join(home, 'tacit.db')), pages: counts.pages, visits: counts.visits },
          decisions,
          mcp: `${process.execPath} ${MCP_PATH}`,
        };
        if (args.json) return say(JSON.stringify(status, null, 2));
        return say(
          [
            `Harness: ${health ? `running, ${HARNESS_ORIGIN}` : await absent()}`,
            `Ledger: ${status.ledger.path} · ${counts.pages} pages · ${counts.visits} visits`,
            `Decisions: ${chainText(decisions)}`,
            `For MCP clients: ${status.mcp}`,
          ].join('\n'),
        );
      }
      default:
        if (!READS.includes(args.command)) fail(`Unknown command: ${args.command}\n\n${USAGE}`);
        return store ? read(store, args) : say(args.json ? 'null' : EMPTY_LEDGER);
    }
  } finally {
    store?.close();
  }
}

await main();
