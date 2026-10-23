// The agents `bun run setup` connects, and where each keeps the two things Tacit adds: a prompt hook, so a note about
// the screen arrives by itself when a prompt needs it, and one line in its own instructions, so it knows `tacit` is
// there when it wants more. The formats are each agent's own, as documented and as tried against a stand-in model in
// October 2026 (`bun run agents:check`); docs/agents.md has the rest, and the agents setup leaves alone.

import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Env } from './db';
import type { HookAgent } from './hooks';

export interface AgentSpec {
  id: 'claude' | 'codex' | 'gemini' | 'opencode';
  name: string;
  /** Its executable: on PATH means installed. */
  bin: string;
  /** Where it keeps its own files: an environment variable can move them. */
  root(env: Env, home: string): string;
  /** Its own instructions file, under root, for the line about `tacit`; none where Tacit's skill does that job. */
  instructions?: string;
  /** Its prompt hook: an entry in a JSON settings file under root, or a plugin file there. */
  hook: { file: string; event: string; timeout: number; agent: HookAgent } | { file: string; plugin: true };
}

export const AGENTS: AgentSpec[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    root: (env, home) => env.CLAUDE_CONFIG_DIR || join(home, '.claude'),
    hook: { file: 'settings.json', event: 'UserPromptSubmit', timeout: 10, agent: 'claude' },
  },
  {
    id: 'codex',
    name: 'Codex',
    bin: 'codex',
    root: (env, home) => env.CODEX_HOME || join(home, '.codex'),
    instructions: 'AGENTS.md',
    hook: { file: 'hooks.json', event: 'UserPromptSubmit', timeout: 10, agent: 'codex' },
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    bin: 'gemini',
    root: (env, home) => join(env.GEMINI_CLI_HOME || home, '.gemini'),
    instructions: 'GEMINI.md',
    // Milliseconds, unlike the others.
    hook: { file: 'settings.json', event: 'BeforeAgent', timeout: 10_000, agent: 'gemini' },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode',
    root: (env, home) => join(env.XDG_CONFIG_HOME || join(home, '.config'), 'opencode'),
    instructions: 'AGENTS.md',
    hook: { file: 'plugins/tacit.ts', plugin: true },
  },
];

const CLI_PATH = join(import.meta.dir, 'cli.ts');
const PLUGIN_PATH = join(import.meta.dir, 'opencode.ts');

export function shellQuote(s: string): string {
  return /^[\w./:@%+=-]+$/.test(s) ? s : `'${s.replaceAll("'", `'\\''`)}'`;
}

/** `tacit`, as a command any agent can run: absolute paths, since agents run hooks and tools without the user's shell. */
export function tacitCommand(home: string, runtime = process.execPath): string[] {
  return [...(home === join(homedir(), '.tacit') ? [] : ['env', `TACIT_HOME=${home}`]), runtime, CLI_PATH];
}

/** `tacit` by name where `bun link` put this checkout's on PATH, else the command with absolute paths. */
export function tacitName(home: string, runtime = process.execPath): string {
  const found = Bun.which('tacit');
  let linked = false;
  try {
    linked = !!found && realpathSync(found) === realpathSync(CLI_PATH);
  } catch {
    // A link that points nowhere.
  }
  return linked && home === join(homedir(), '.tacit') ? 'tacit' : tacitCommand(home, runtime).map(shellQuote).join(' ');
}

/** The one line in an agent's instructions: under 50 tokens on every request, and `tacit` itself only when needed. */
export function agentLine(command: string): string {
  return `\`${command}\` prints what the user has open in their browser and what they are after: run it instead of asking them to paste a page, and \`${command} help\` for more. ${LINE_MARK}`;
}

const LINE_MARK = '<!-- tacit -->';

export type Change = 'added' | 'updated' | 'already';

/** Writes a file an agent owns, keeping the first version Tacit found next to it. */
function rewrite(path: string, text: string): void {
  if (existsSync(path) && !existsSync(`${path}.before-tacit`)) copyFileSync(path, `${path}.before-tacit`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Adds the line to the agent's instructions, or brings an older one up to date. */
export function addLine(spec: AgentSpec, env: Env, home: string, line: string): Change {
  const path = join(spec.root(env, home), spec.instructions!);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.includes(LINE_MARK));
  if (at >= 0 && lines[at] === line) return 'already';
  if (at >= 0) lines[at] = line;
  rewrite(path, at >= 0 ? lines.join('\n') : `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${line}\n`);
  return at >= 0 ? 'updated' : 'added';
}

export function hasLine(spec: AgentSpec, env: Env, home: string, line: string): boolean {
  const path = join(spec.root(env, home), spec.instructions!);
  return existsSync(path) && readFileSync(path, 'utf8').split('\n').includes(line);
}

/** Something Tacit wrote: a hook that runs Tacit's command line, or the OpenCode plugin. */
const TACIT_HOOK = /daemon\/cli\.ts'? hook |\btacit hook |tacitPlugin/;
const isTacitHook = (command: unknown) => typeof command === 'string' && TACIT_HOOK.test(command);

interface HookGroup {
  matcher?: string;
  hooks?: { type?: string; command?: string }[];
}

/**
 * Settings with Tacit's hook in them, replacing any older one Tacit wrote and leaving every other hook as it was;
 * null when the file holds something Tacit should not rewrite.
 */
export function withHook(settings: unknown, event: string, command: string, timeout: number): Record<string, unknown> | null {
  if (settings === undefined) settings = {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const root = settings as Record<string, unknown>;
  const hooks = (root.hooks ?? {}) as Record<string, unknown>;
  if (typeof hooks !== 'object' || Array.isArray(hooks)) return null;
  const groups = (hooks[event] ?? []) as HookGroup[];
  if (!Array.isArray(groups)) return null;
  const others = groups
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isTacitHook(h.command)) }))
    .filter((g) => g.hooks.length);
  return { ...root, hooks: { ...hooks, [event]: [...others, { hooks: [{ type: 'command', command, timeout }] }] } };
}

function readJson(path: string): { value?: unknown; problem?: string } {
  if (!existsSync(path)) return {};
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (err) {
    return { problem: `${path} is not plain JSON (${err instanceof Error ? err.message : String(err)})` };
  }
}

/** The plugin OpenCode loads: two lines that point at this checkout. */
export function pluginText(command: string[]): string {
  return `// Tacit, for OpenCode: a note about the browser before a message that needs one. Delete this file to remove it.\nimport { tacitPlugin } from ${JSON.stringify(PLUGIN_PATH)};\nexport const Tacit = tacitPlugin(${JSON.stringify(command)});\n`;
}

/** What the agent's hook would be, exactly: the file, and its new contents (or why Tacit will not write it). */
function hookTarget(spec: AgentSpec, env: Env, home: string, command: string[]): { path: string; text?: string; problem?: string } {
  const path = join(spec.root(env, home), spec.hook.file);
  if ('plugin' in spec.hook) return { path, text: pluginText(command) };
  const { value, problem } = readJson(path);
  if (problem) return { path, problem };
  const next = withHook(value, spec.hook.event, [...command, 'hook', spec.hook.agent].map(shellQuote).join(' '), spec.hook.timeout);
  return next ? { path, text: `${JSON.stringify(next, null, 2)}\n` } : { path, problem: `${path} has hooks Tacit does not recognize` };
}

export function hasHook(spec: AgentSpec, env: Env, home: string, command: string[]): boolean {
  const t = hookTarget(spec, env, home, command);
  return !!t.text && existsSync(t.path) && readFileSync(t.path, 'utf8') === t.text;
}

/** Adds the hook, or says why it did not: a file that is not plain JSON is left to the user. */
export function addHook(spec: AgentSpec, env: Env, home: string, command: string[]): Change | { problem: string } {
  const t = hookTarget(spec, env, home, command);
  if (t.problem || !t.text) return { problem: t.problem ?? 'nothing to write' };
  const before = existsSync(t.path) ? readFileSync(t.path, 'utf8') : '';
  if (before === t.text) return 'already';
  rewrite(t.path, t.text);
  return TACIT_HOOK.test(before) ? 'updated' : 'added';
}

/** Where the hook goes, for messages. */
export const hookPath = (spec: AgentSpec, env: Env, home: string) => join(spec.root(env, home), spec.hook.file);
export const linePath = (spec: AgentSpec, env: Env, home: string) => join(spec.root(env, home), spec.instructions ?? '');

type McpServer = { command: string; args: string[]; env?: Record<string, string> };

const serversOf = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? ((value as { mcpServers?: unknown }).mcpServers ?? {}) : undefined;

export function hasServer(path: string, server: McpServer): boolean {
  const servers = serversOf(readJson(path).value);
  return !!servers && JSON.stringify((servers as Record<string, unknown>).tacit) === JSON.stringify(server);
}

/** Tacit's MCP server in a client's JSON config (Cursor's mcp.json): its entry changes, nothing else does. */
export function addServer(path: string, server: McpServer): Change | { problem: string } {
  const { value, problem } = readJson(path);
  if (problem) return { problem };
  const root = value ?? {};
  const servers = serversOf(root);
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return { problem: `${path} holds something other than MCP servers` };
  if (JSON.stringify((servers as Record<string, unknown>).tacit) === JSON.stringify(server)) return 'already';
  const had = 'tacit' in servers;
  rewrite(path, `${JSON.stringify({ ...(root as object), mcpServers: { ...servers, tacit: server } }, null, 2)}\n`);
  return had ? 'updated' : 'added';
}
