// Keeps the harness running in the background: started at login, restarted if it stops.
// Installing writes one file (a launchd agent on macOS, a systemd user unit on Linux) after a yes.
// Usage: bun run service install [--yes] [--dry-run] | uninstall | status

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { HARNESS_ORIGIN, provesToken } from '../core';
import { readToken } from '../daemon/auth';
import { tacitHome } from '../daemon/db';
import { SERVICE_LABEL, SYSTEMD_UNIT, launchAgentPlist, proxyEnv, systemdUnit } from '../daemon/service';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const [command = 'status', ...rest] = process.argv.slice(2);
const flags = new Set(rest);
const home = tacitHome();
const mac = process.platform === 'darwin';
const file = mac ? join(homedir(), 'Library/LaunchAgents', `${SERVICE_LABEL}.plist`) : join(homedir(), '.config/systemd/user', SYSTEMD_UNIT);
const domain = `gui/${process.getuid?.() ?? 0}`;
const run = (cmd: string[]) => Bun.spawnSync(cmd, { stdout: 'ignore', stderr: 'pipe' });

if (!mac && process.platform !== 'linux') {
  console.log('A background service is not supported on this system yet: run bun run harness in a terminal of its own.');
  process.exit(0);
}

/** Running means proving it is this user's harness, not just answering on the port. */
async function ours(): Promise<boolean> {
  const token = readToken(home);
  return !!token && (await provesToken(HARNESS_ORIGIN, token));
}

function fail(what: string, stderr: Uint8Array): never {
  console.error(`${what} failed: ${new TextDecoder().decode(stderr).trim()}`);
  process.exit(1);
}

if (command === 'status') {
  console.log(existsSync(file) ? `Installed: ${file}` : 'Not installed. Run: bun run service install');
  console.log((await ours()) ? `The harness is running: ${HARNESS_ORIGIN}` : 'The harness is not running.');
} else if (command === 'install') {
  const proxy = proxyEnv(process.env);
  const spec = { runtime: process.execPath, root: ROOT, home, env: proxy.env };
  const text = mac ? launchAgentPlist(spec) : systemdUnit(spec);
  const carried = Object.keys(proxy.env).filter((k) => k === k.toUpperCase());
  if (carried.length) console.log(`Carrying this shell's proxy settings into the service: ${carried.join(', ')}.`);
  if (proxy.withPassword.length) console.log(`Left out ${proxy.withPassword.join(', ')}: it has a password in it, and the service file is readable by others.`);
  if (flags.has('--dry-run')) {
    console.log(`Would write ${file}:\n\n${text}`);
    process.exit(0);
  }
  const listening = await fetch(`${HARNESS_ORIGIN}/v1/health`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok, () => false);
  if (listening && !existsSync(file)) {
    console.error(`A harness is already running at ${HARNESS_ORIGIN}. Stop it first; the service starts its own.`);
    process.exit(1);
  }
  const agreed = flags.has('--yes') || (process.stdin.isTTY && confirm(`Run the Tacit harness in the background, from login on (${file})?`));
  if (!agreed) {
    console.log('Nothing changed. An agent should ask first, then pass --yes.');
    process.exit(0);
  }
  // launchd opens the log before the harness runs, so the folder must exist; 0700, as the harness makes it.
  mkdirSync(home, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  if (mac) {
    run(['launchctl', 'bootout', `${domain}/${SERVICE_LABEL}`]);
    const r = run(['launchctl', 'bootstrap', domain, file]);
    if (r.exitCode !== 0) fail('launchctl bootstrap', r.stderr);
  } else {
    run(['systemctl', '--user', 'daemon-reload']);
    const r = run(['systemctl', '--user', 'enable', '--now', SYSTEMD_UNIT]);
    if (r.exitCode !== 0) fail('systemctl enable', r.stderr);
  }
  for (let i = 0; i < 20 && !(await ours()); i++) await Bun.sleep(250);
  console.log((await ours()) ? `Installed. The harness runs now and after every login: ${HARNESS_ORIGIN}` : `Installed, but the harness has not answered yet. Its log: ${home}/harness.log`);
} else if (command === 'uninstall') {
  if (mac) run(['launchctl', 'bootout', `${domain}/${SERVICE_LABEL}`]);
  else run(['systemctl', '--user', 'disable', '--now', SYSTEMD_UNIT]);
  if (existsSync(file)) rmSync(file);
  if (!mac) run(['systemctl', '--user', 'daemon-reload']);
  console.log('Uninstalled. The harness no longer starts on its own; the ledger is untouched.');
} else {
  console.error('Usage: bun run service install [--yes] [--dry-run] | uninstall | status');
  process.exit(1);
}
