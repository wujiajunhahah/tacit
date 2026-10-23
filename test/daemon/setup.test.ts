import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// `bun run setup` against a throwaway home and a fake `claude` that only records its calls:
// nothing here touches the real Claude Code config or ~/.claude.
const ROOT = new URL('../..', import.meta.url).pathname;
const SKILL = readFileSync(join(ROOT, 'skills/tacit/SKILL.md'), 'utf8');

let home: string;
let calls: string;

const MCP = join(ROOT, 'daemon/mcp.ts');

interface Fakes {
  /** Where Claude Code's tacit entry points; none when unset. */
  knows?: string;
  /** Install a fake `openclaw` too: where its tacit entry points (or ''), and whether `set` fails (Gateway running). */
  openclaw?: { knows: string; busy?: boolean };
  /** Other agents found on PATH; their fakes do nothing, since setup only writes their files. */
  agents?: string[];
}

function setup(args: string[], opts: Fakes = {}) {
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  // `claude mcp get tacit` prints where Claude Code's tacit entry points (opts.knows), or fails; everything else succeeds.
  const get = opts.knows ? `echo "tacit: bun ${opts.knows}"; exit 0` : 'exit 1';
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\necho "claude $*" >> "${calls}"\nif [ "$1 $2" = "mcp get" ]; then ${get}; fi\nexit 0\n`);
  chmodSync(join(bin, 'claude'), 0o755);
  if (opts.openclaw) {
    const show = opts.openclaw.knows ? `echo '{"command":"bun","args":["${opts.openclaw.knows}"]}'; exit 0` : 'exit 1';
    const set = opts.openclaw.busy ? 'exit 1' : 'exit 0';
    writeFileSync(join(bin, 'openclaw'), `#!/bin/sh\necho "openclaw $*" >> "${calls}"\nif [ "$1 $2" = "mcp show" ]; then ${show}; fi\nif [ "$1 $2" = "mcp set" ]; then ${set}; fi\nexit 0\n`);
    chmodSync(join(bin, 'openclaw'), 0o755);
  }
  for (const name of opts.agents ?? []) {
    writeFileSync(join(bin, name), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, name), 0o755);
  }
  const out = Bun.spawnSync(['bun', 'run', join(ROOT, 'scripts/setup.ts'), '--no-build', ...args], {
    cwd: ROOT,
    env: { HOME: home, TACIT_HOME: join(home, '.tacit'), PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin` },
  });
  return { code: out.exitCode, text: out.stdout.toString(), calls: existsSync(calls) ? readFileSync(calls, 'utf8') : '' };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'tacit-setup-'));
  calls = join(home, 'claude-calls');
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('bun run setup', () => {
  test('with a yes, it connects Claude Code for every project and installs the skill', () => {
    const r = setup(['--yes']);
    expect(r.code).toBe(0);
    expect(r.calls).toContain('claude mcp get tacit');
    expect(r.calls).toContain(`mcp add --scope user --transport stdio tacit -- ${process.execPath} ${MCP}`);
    expect(readFileSync(join(home, '.claude/skills/tacit/SKILL.md'), 'utf8')).toBe(SKILL);
    expect(r.text).toContain('Load the extension (this needs you)');
  });

  test('a dry run changes nothing outside the folder', () => {
    const r = setup(['--dry-run']);
    expect(r.code).toBe(0);
    expect(r.calls).not.toContain('mcp add');
    expect(existsSync(join(home, '.claude'))).toBe(false);
    expect(r.text).toContain('Would do');
    expect(r.text).toContain('claude mcp add --scope user --transport stdio tacit');
  });

  test('without a terminal or a yes, it asks for nothing and changes nothing', () => {
    const r = setup([]);
    expect(r.calls).not.toContain('mcp add');
    expect(existsSync(join(home, '.claude'))).toBe(false);
  });

  test('an entry pointing at another checkout is replaced, after a yes', () => {
    const r = setup(['--yes'], { knows: '/old/tacit/daemon/mcp.ts' });
    expect(r.calls).toContain('claude mcp remove tacit --scope user');
    expect(r.calls).toContain(`mcp add --scope user --transport stdio tacit -- ${process.execPath} ${MCP}`);
  });

  test('OpenClaw gets Tacit as an MCP server, after a yes', () => {
    const r = setup(['--yes'], { openclaw: { knows: '' } });
    expect(r.calls).toContain(`openclaw mcp set tacit {"command":"${process.execPath}","args":["${MCP}"]}`);
    expect(r.text).toContain('Added Tacit to OpenClaw');
  });

  test('an OpenClaw that already points here is left alone; a busy one gets directions', () => {
    expect(setup(['--yes'], { openclaw: { knows: MCP } }).calls).not.toContain('openclaw mcp set');
    writeFileSync(calls, '');
    expect(setup(['--yes'], { openclaw: { knows: '', busy: true } }).text).toContain('Control UI: Settings → MCP');
  });

  test('every agent found gets a note before prompts that need one, and a line about tacit, after a yes', () => {
    const r = setup(['--yes'], { agents: ['codex', 'gemini', 'opencode'] });
    const json = (path: string) => JSON.parse(readFileSync(join(home, path), 'utf8'));
    const CLI = join(ROOT, 'daemon/cli.ts');
    expect(json('.claude/settings.json').hooks.UserPromptSubmit).toEqual([{ hooks: [{ type: 'command', command: `${process.execPath} ${CLI} hook claude`, timeout: 10 }] }]);
    expect(json('.codex/hooks.json').hooks.UserPromptSubmit[0].hooks[0].command).toBe(`${process.execPath} ${CLI} hook codex`);
    expect(json('.gemini/settings.json').hooks.BeforeAgent[0].hooks[0]).toMatchObject({ command: `${process.execPath} ${CLI} hook gemini`, timeout: 10_000 });
    expect(readFileSync(join(home, '.config/opencode/plugins/tacit.ts'), 'utf8')).toContain(`tacitPlugin(["${process.execPath}","${CLI}"])`);
    for (const file of ['.codex/AGENTS.md', '.gemini/GEMINI.md', '.config/opencode/AGENTS.md']) {
      expect(readFileSync(join(home, file), 'utf8')).toContain(`\`${process.execPath} ${CLI}\` prints what the user has open in their browser`);
    }
    expect(r.text).toContain('trust it in /hooks');

    const again = setup(['--yes'], { agents: ['codex', 'gemini', 'opencode'] });
    for (const name of ['Claude Code', 'Codex', 'Gemini CLI', 'OpenCode']) expect(again.text).toContain(`${name} gets a note before prompts that need one`);
    expect(again.text).not.toContain('trust it in /hooks');
  });

  test('hooks and settings already there stay; a settings file that is not plain JSON is left alone', () => {
    const settings = { permissions: { allow: ['Bash(ls)'] }, hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo hi' }] }], Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } };
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude/settings.json'), JSON.stringify(settings));
    mkdirSync(join(home, '.gemini'), { recursive: true });
    writeFileSync(join(home, '.gemini/settings.json'), '// mine\n{}\n');
    writeFileSync(join(home, '.gemini/GEMINI.md'), '# My rules\nBe brief.');
    const r = setup(['--yes'], { agents: ['gemini'] });
    const after = JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf8'));
    expect(after.permissions).toEqual(settings.permissions);
    expect(after.hooks.Stop).toEqual(settings.hooks.Stop);
    expect(after.hooks.UserPromptSubmit[0]).toEqual(settings.hooks.UserPromptSubmit[0]);
    expect(after.hooks.UserPromptSubmit[1].hooks[0].command).toEndWith('hook claude');
    expect(readFileSync(join(home, '.claude/settings.json.before-tacit'), 'utf8')).toBe(JSON.stringify(settings));
    expect(readFileSync(join(home, '.gemini/settings.json'), 'utf8')).toBe('// mine\n{}\n');
    expect(r.text).toContain('is not plain JSON');
    expect(readFileSync(join(home, '.gemini/GEMINI.md'), 'utf8')).toStartWith(`# My rules\nBe brief.\n\n\`${process.execPath} ${join(ROOT, 'daemon/cli.ts')}\` prints what the user has open`);
  });

  test('Cursor gets the tools in its MCP config, next to the servers it had', () => {
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(join(home, '.cursor/mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'other' } } }));
    expect(setup(['--yes']).text).toContain('Cursor: added Tacit');
    expect(JSON.parse(readFileSync(join(home, '.cursor/mcp.json'), 'utf8')).mcpServers).toEqual({ other: { command: 'other' }, tacit: { command: process.execPath, args: [MCP] } });
  });

  test('a dry run writes no agent files', () => {
    const r = setup(['--dry-run'], { agents: ['codex', 'gemini', 'opencode'] });
    for (const dir of ['.claude', '.codex', '.gemini', '.config', '.bun']) expect(existsSync(join(home, dir))).toBe(false);
    expect(r.text).toContain('Codex: add a note before prompts that need one');
  });

  test('a second run leaves a working setup alone', () => {
    setup(['--yes']);
    writeFileSync(calls, '');
    const r = setup(['--yes'], { knows: MCP });
    expect(r.calls).not.toContain('mcp add');
    expect(r.text).toContain('Claude Code already has Tacit');
    expect(r.text).toContain('The Tacit skill is installed');
  });
});
