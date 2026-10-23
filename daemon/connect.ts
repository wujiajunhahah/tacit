// How an agent reaches this machine's ledger: exact commands, with absolute paths, ready to paste.

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectResponse } from '../core';
import { agentLine, shellQuote, tacitCommand, tacitName } from './agents';
import { MODELS_FILE, type EngineChoice } from './engine';
import { tilde } from './units';

export const MCP_PATH = join(import.meta.dir, 'mcp.ts');

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
  const cli = tacitCommand(home, runtime).map(shellQuote).join(' ');
  return {
    engine: engine.name,
    model: engine.model,
    decisions: engine.decisions,
    modelsFile: tilde(join(home, MODELS_FILE)),
    mcpPath: MCP_PATH,
    cli,
    agentLine: agentLine(tacitName(home, runtime)),
    claudeCommand: ['claude', ...claudeAddArgs(home, runtime)].map(shellQuote).join(' '),
    mcpConfig: { mcpServers: { tacit: { command: runtime, args: [MCP_PATH], ...(env ? { env } : {}) } } },
  };
}
