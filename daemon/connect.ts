// How an agent reaches this machine's ledger: exact commands, with absolute paths, ready to paste.

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectResponse } from '../core';
import type { EngineChoice } from './engine';

export const MCP_PATH = join(import.meta.dir, 'mcp.ts');

function shellQuote(s: string): string {
  return /^[\w./:@%+=-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

const isDefaultHome = (home: string) => home === join(homedir(), '.tacit');

/**
 * `claude mcp add` arguments, at user scope so Tacit is there in every project. Options come before the name, and
 * `--transport` separates the variadic `--env` from it, as the Claude Code docs ask. Absolute paths: clients start
 * servers without the user's PATH.
 */
export function claudeAddArgs(home: string, runtime = process.execPath): string[] {
  const env = isDefaultHome(home) ? [] : ['--env', `TACIT_HOME=${home}`];
  return ['mcp', 'add', '--scope', 'user', ...env, '--transport', 'stdio', 'tacit', '--', runtime, MCP_PATH];
}

export function connectInfo(engine: EngineChoice, home: string, runtime = process.execPath): ConnectResponse {
  const env = isDefaultHome(home) ? undefined : { TACIT_HOME: home };
  return {
    engine: engine.name,
    model: engine.model,
    mcpPath: MCP_PATH,
    claudeCommand: ['claude', ...claudeAddArgs(home, runtime)].map(shellQuote).join(' '),
    mcpConfig: { mcpServers: { tacit: { command: runtime, args: [MCP_PATH], ...(env ? { env } : {}) } } },
  };
}
