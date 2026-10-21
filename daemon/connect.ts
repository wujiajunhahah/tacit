// How an agent reaches this machine's ledger: exact commands, with absolute paths, ready to paste.

import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectResponse } from '../core';
import type { EngineChoice } from './engine';

export const MCP_PATH = join(import.meta.dir, 'mcp.ts');

function shellQuote(s: string): string {
  return /^[\w./:@%+=-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

/** Absolute paths, because MCP clients start servers without the user's shell PATH. */
export function connectInfo(engine: EngineChoice, home: string, runtime = process.execPath): ConnectResponse {
  const env = home === join(homedir(), '.tacit') ? undefined : { TACIT_HOME: home };
  const envFlag = env ? ` -e TACIT_HOME=${shellQuote(home)}` : '';
  return {
    engine: engine.name,
    model: engine.model,
    mcpPath: MCP_PATH,
    claudeCommand: `claude mcp add --scope user tacit${envFlag} -- ${shellQuote(runtime)} ${shellQuote(MCP_PATH)}`,
    mcpConfig: { mcpServers: { tacit: { command: runtime, args: [MCP_PATH], ...(env ? { env } : {}) } } },
  };
}
