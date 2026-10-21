// Gets Tacit ready on this machine: checks Bun, builds, checks the harness, and connects Claude Code if it is here.
// Nothing outside this folder (Claude Code's MCP list, ~/.claude/skills) changes without a yes. --yes says yes in
// advance; an agent should ask the user first. --dry-run only says what would happen.
// Usage: bun run setup [--yes] [--dry-run]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { HARNESS_ORIGIN, type StatsResponse } from '../core';
import { MCP_PATH, claudeAddArgs, connectInfo } from '../daemon/connect';
import { tacitHome } from '../daemon/db';
import { chooseEngine } from '../daemon/engine';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const flags = new Set(process.argv.slice(2));
const dry = flags.has('--dry-run');
const yes = flags.has('--yes');
const home = tacitHome();
const info = connectInfo(chooseEngine(process.env), home);
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
const ledger = await fetch(`${HARNESS_ORIGIN}/v1/stats`, { signal: AbortSignal.timeout(800) })
  .then((r) => (r.ok ? (r.json() as Promise<StatsResponse>) : null))
  .then((s) => s?.storage.path ?? null)
  .catch(() => null);
if (!ledger) left.push('Start the harness and keep it running: bun run harness');
else if (ledger === join(home, 'tacit.db')) done.push(`The harness is running: ${HARNESS_ORIGIN}`);
else left.push(`The running harness keeps its ledger in ${ledger}, not ${home}. For everyday use, stop it and run: bun run harness`);

// 3. Agents. Claude Code is connected here; any other client gets its config printed.
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
} else {
  left.push(`For Cursor, Windsurf, Codex or another MCP client, add this server to its MCP config:\n${JSON.stringify(info.mcpConfig, null, 2)}`);
}

// 4. The one step that needs a person.
left.push(`Load the extension (this needs you): open chrome://extensions, turn on Developer mode, click Load unpacked, pick ${join(ROOT, 'extension')}`);

const list = (items: string[]) => items.map((s) => `  - ${s.replaceAll('\n', '\n    ')}`).join('\n');
if (done.length) console.log(`\nDone\n${list(done)}`);
console.log(`\n${dry ? 'Would do' : 'Left to do'}\n${list(left)}`);
console.log('\nThen search for anything, open a result, and look at the line at the bottom of the page. GUIDE.md has what to try.');
