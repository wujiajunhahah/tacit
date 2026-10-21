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

function setup(args: string[], opts: { knows?: string } = {}) {
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  // `claude mcp get tacit` prints where Claude Code's tacit entry points (opts.knows), or fails; everything else succeeds.
  const get = opts.knows ? `echo "tacit: bun ${opts.knows}"; exit 0` : 'exit 1';
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\necho "$*" >> "${calls}"\nif [ "$1 $2" = "mcp get" ]; then ${get}; fi\nexit 0\n`);
  chmodSync(join(bin, 'claude'), 0o755);
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
    expect(r.calls).toContain('mcp get tacit');
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
    expect(r.calls).toContain('mcp remove tacit --scope user');
    expect(r.calls).toContain(`mcp add --scope user --transport stdio tacit -- ${process.execPath} ${MCP}`);
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
