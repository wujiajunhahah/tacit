// Gets Tacit ready on this machine: checks Bun, builds, checks the harness, and connects the agents it finds (Claude Code,
// Codex, Gemini CLI, OpenCode, Cursor, OpenClaw). Nothing outside this folder (an agent's settings, hooks or
// instructions, ~/.bun/bin) changes without a yes. --yes says yes in advance; an agent should ask the user first.
// --dry-run only says what would happen.
// Usage: bun run setup [--yes] [--dry-run]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HARNESS_ORIGIN, authHeader, provesToken, type StatsResponse } from '../core';
import { addHook, addLine, addServer, agentLine, AGENTS, hasHook, hasLine, hasServer, hookPath, linePath, tacitCommand, tacitName } from '../daemon/agents';
import { readToken } from '../daemon/auth';
import { MCP_PATH, claudeAddArgs, connectInfo } from '../daemon/connect';
import { tacitHome } from '../daemon/db';
import { chainText, chooseEngine } from '../daemon/engine';
import { tilde } from '../daemon/units';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const flags = new Set(process.argv.slice(2));
const dry = flags.has('--dry-run');
const yes = flags.has('--yes');
const home = tacitHome();
const choice = chooseEngine(process.env, home);
const info = connectInfo(choice, home);
const done: string[] = [];
const left: string[] = [];

/** A change outside this folder: done on a yes, said otherwise. */
function agree(question: string): boolean {
  if (dry) return false;
  if (yes) return true;
  // Run by an agent (no terminal): it should ask the user, then pass --yes.
  return process.stdin.isTTY ? confirm(question) : false;
}

const run = (cmd: string[]) => Bun.spawnSync(cmd, { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' }).exitCode === 0;

// 1. Bun, dependencies and the build.
const [major = 0, minor = 0] = Bun.version.split('.').map(Number);
if (major < 1 || (major === 1 && minor < 4)) {
  console.error(`Tacit needs Bun 1.4 or later; this is ${Bun.version}. Run: bun upgrade`);
  process.exit(1);
}
if (!existsSync(join(ROOT, 'node_modules'))) {
  if (dry) left.push('Install dependencies: bun install');
  else if (!run(['bun', 'install'])) process.exit(1);
}
if (dry || flags.has('--no-build')) left.push('Build: bun run build');
else if (run(['bun', 'run', 'scripts/build.ts'])) done.push('Built the extension and the page runtime');
else process.exit(1);

// 2. The harness keeps the ledger; the extension works without it, agents need it.
// A harness counts only if it proves it holds this user's token; the token is sent only after that.
const token = readToken(home);
const listening = await fetch(`${HARNESS_ORIGIN}/v1/health`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok, () => false);
const ours = !!token && (await provesToken(HARNESS_ORIGIN, token));
const ledger = ours
  ? await fetch(`${HARNESS_ORIGIN}/v1/stats`, { headers: authHeader(token!), signal: AbortSignal.timeout(800) })
      .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : null))
      .then((s) => s?.storage.path ?? null, () => null)
  : null;
if (!listening) left.push('Run the harness in the background, from login on: bun run service install (or, for now only: bun run harness)');
else if (!ours) left.push(`Something at ${HARNESS_ORIGIN} is not the harness for ${home} (one started with another TACIT_HOME, or another program). Stop it, then run: bun run harness`);
else if (ledger === join(home, 'tacit.db')) done.push(`The harness is running: ${HARNESS_ORIGIN}`);
else left.push(`The running harness keeps its ledger in ${ledger}, not ${home}. For everyday use, stop it and run: bun run harness`);

// 3. Agents. Any agent with a shell can run `tacit`. Each one found here, after a yes, also gets a prompt hook, so a
// note about the screen arrives by itself when a prompt needs one, and a line in its instructions about `tacit`.
// Claude Code gets Tacit's MCP tools and skill in place of the line; Cursor, which has no such hook, the tools.
if (tacitName(home) === 'tacit') done.push('`tacit` is a command here');
else if (agree('Make `tacit` a command you and your agents can run (bun link, in ~/.bun/bin)?') && run(['bun', 'link'])) {
  done.push(Bun.which('tacit') ? 'Linked `tacit`: try it in a terminal' : 'Linked `tacit` into ~/.bun/bin, which is not on PATH here; add it to run `tacit` by name');
} else left.push('Make `tacit` a command: bun link, in this folder');

const command = tacitCommand(home);
const line = agentLine(tacitName(home));
const at = (path: string) => tilde(path);

const claude = Bun.which('claude');
if (claude) {
  // `claude mcp get` exit codes are not documented, so an entry counts only if it points at this checkout. Asked from
  // outside any project, only user scope answers: an old local entry in this folder must not pass for one.
  const got = Bun.spawnSync([claude, 'mcp', 'get', 'tacit'], { cwd: tmpdir(), stdout: 'pipe', stderr: 'pipe' });
  const elsewhere = got.exitCode === 0 && !got.stdout.toString().includes(MCP_PATH);
  if (got.exitCode === 0 && !elsewhere) done.push('Claude Code already has Tacit');
  else if (agree(elsewhere ? 'Claude Code has a Tacit entry that points elsewhere. Point it at this folder?' : 'Add Tacit to Claude Code, for every project?')) {
    Bun.spawnSync([claude, 'mcp', 'remove', 'tacit', '--scope', 'user'], { stdout: 'ignore', stderr: 'ignore' });
    if (run([claude, ...claudeAddArgs(home)])) done.push('Added Tacit to Claude Code. Restart Claude Code to see its tools');
    else left.push(`Add Tacit to Claude Code: ${info.claudeCommand}`);
  } else left.push(`Add Tacit to Claude Code: ${info.claudeCommand}`);

  const skill = readFileSync(join(ROOT, 'skills/tacit/SKILL.md'), 'utf8');
  const target = join(homedir(), '.claude', 'skills', 'tacit', 'SKILL.md');
  if (existsSync(target) && readFileSync(target, 'utf8') === skill) done.push('The Tacit skill is installed');
  else if (agree(`Install the Tacit skill at ${target}?`)) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, skill);
    done.push(`Installed the Tacit skill: ${target}. In a Claude Code session that is already open, run /reload-skills`);
  } else left.push(`Install the skill: copy skills/tacit/SKILL.md to ${target}`);
}

for (const spec of AGENTS) {
  if (!Bun.which(spec.bin)) continue;
  const hookAt = at(hookPath(spec, process.env, homedir()));
  const lineAt = spec.instructions ? at(linePath(spec, process.env, homedir())) : '';
  const what = lineAt ? `a note before prompts that need one, and a line about \`tacit\` (${hookAt}, ${lineAt})` : `a note before prompts that need one (${hookAt})`;
  const has = hasHook(spec, process.env, homedir(), command) && (!spec.instructions || hasLine(spec, process.env, homedir(), line));
  if (has) done.push(`${spec.name} gets a note before prompts that need one`);
  else if (agree(`${spec.name}: add ${what}?`)) {
    const hook = addHook(spec, process.env, homedir(), command);
    if (typeof hook === 'object') left.push(`${spec.name}: ${hook.problem}. Add the hook by hand, as docs/agents.md shows`);
    else done.push(`${spec.name}: ${hook === 'already' ? 'has' : hook} the hook in ${hookAt}`);
    if (spec.instructions) done.push(`${spec.name}: ${addLine(spec, process.env, homedir(), line) === 'already' ? 'has' : 'added'} the line in ${lineAt}`);
    if (spec.id === 'codex' && hook !== 'already') left.push('Codex runs a new hook only once you trust it: open Codex and trust it in /hooks');
  } else left.push(`${spec.name}: add ${what}. Run bun run setup again and say yes, or see docs/agents.md`);
}

// Cursor's hooks cannot add to a prompt, so it gets the tools. Its MCP config is a JSON file; nothing else in it changes.
const cursor = join(homedir(), '.cursor');
if (existsSync(cursor) || Bun.which('cursor-agent')) {
  const path = join(cursor, 'mcp.json');
  const server = info.mcpConfig.mcpServers.tacit;
  const r = hasServer(path, server) ? 'already' : agree(`Cursor: add Tacit's tools (${at(path)})?`) ? addServer(path, server) : null;
  if (r === null) left.push(`Cursor: add Tacit's tools to ${at(path)}:\n${JSON.stringify(info.mcpConfig, null, 2)}`);
  else if (typeof r === 'object') left.push(`Cursor: ${r.problem}. Add this to it by hand:\n${JSON.stringify(info.mcpConfig, null, 2)}`);
  else done.push(`Cursor: ${r === 'already' ? 'has' : r} Tacit's tools in ${at(path)}`);
}

// OpenClaw: Tacit becomes an MCP server its agents can call. `set` replaces the entry, so a re-run is harmless; it
// refuses while OpenClaw's Gateway runs, and then the Control UI is the way.
const openclaw = Bun.which('openclaw');
const server = info.mcpConfig.mcpServers.tacit;
if (openclaw) {
  const shown = Bun.spawnSync([openclaw, 'mcp', 'show', 'tacit', '--json'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });
  if (shown.exitCode === 0 && shown.stdout.toString().includes(MCP_PATH)) done.push('OpenClaw already has Tacit');
  else if (agree('Add Tacit to OpenClaw as an MCP server?') && run([openclaw, 'mcp', 'set', 'tacit', JSON.stringify(server)])) done.push('Added Tacit to OpenClaw (its agents see the tools as tacit__*)');
  else left.push(`Add Tacit to OpenClaw: openclaw mcp set tacit '${JSON.stringify(server)}'. If its Gateway is running, add the same in the Control UI: Settings → MCP.`);
}
left.push(`Any other agent: put this line in its instructions file, or see docs/agents.md for its hook or MCP:\n${line}`);

// 4. Who decides. The code engine always can; a key lets Jev lead.
const d = choice.decisions;
if (d.problem) left.push(`${d.problem}, in ${info.modelsFile}. Until it is fixed, the code engine decides, on this machine.`);
else if (choice.name === 'local' && d.privacy === 'cloud') left.push('Optional: let Jev decide. Run bun run keys set openrouter (or typesafe), then restart the harness.');
else done.push(`Decisions: ${chainText(d)}`);

// 5. The one step that needs a person, then pairing, which opens a page in that browser.
left.push(`Load the extension (this needs you): open chrome://extensions, turn on Developer mode, click Load unpacked, pick ${join(ROOT, 'extension')}`);
left.push('Then pair that browser with the harness: bun run pair');

const list = (items: string[]) => items.map((s) => `  - ${s.replaceAll('\n', '\n    ')}`).join('\n');
if (done.length) console.log(`\nDone\n${list(done)}`);
console.log(`\n${dry ? 'Would do' : 'Left to do'}\n${list(left)}`);
console.log('\nThen search for anything, open a result, and look at the line at the bottom of the page. GUIDE.md has what to try.');
