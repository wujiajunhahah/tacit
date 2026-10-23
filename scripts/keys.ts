// Model provider keys, kept in <home>/keys.json (readable by this account only), never printed in full.
// Usage:
//   bun run keys list
//   bun run keys set openrouter        (asks for the key without showing it; or pipe it: pbpaste | bun run keys set openrouter)
//   bun run keys remove openrouter
// A running harness picks up the change by itself.

import { mkdirSync } from 'node:fs';
import { tacitHome } from '../daemon/db';
import { KEY_ENV, hint, keySources, loadKeys, saveKey } from '../daemon/keys';

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const [cmd, name] = process.argv.slice(2);
const home = tacitHome();

/** From the keyboard without echo, or all of a pipe. */
async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) return (await Bun.stdin.text()).trim();
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let value = '';
    const finish = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(value.trim());
    };
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        value = ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

function usage(): never {
  console.error('Usage: bun run keys list | set <name> | remove <name>   (names: typesafe, openrouter, deepseek, or one models.json uses)');
  process.exit(2);
}

if (cmd === 'list' || !cmd) {
  const keys = loadKeys(home);
  const sources = keySources(home);
  const names = Object.keys(keys).sort();
  if (!names.length) console.log('No keys yet. The code engine decides, on this machine. Add one: bun run keys set openrouter');
  for (const n of names) console.log(`${n.padEnd(12)} ${hint(keys[n]!).padEnd(14)} ${sources[n] === 'env' ? `from ${KEY_ENV[n]}` : 'keys.json'}`);
} else if (cmd === 'set') {
  if (!name || !NAME.test(name)) usage();
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const value = await readSecret(`Key for ${name} (not shown): `);
  if (!value) {
    console.error('No key given; nothing changed.');
    process.exit(1);
  }
  if (/\s/.test(value)) {
    console.error('That has spaces in it; a key does not. Nothing changed.');
    process.exit(1);
  }
  saveKey(home, name, value);
  console.log(`Saved ${name} (${hint(value)}) to ${home}/keys.json, readable by this account only.`);
  if (KEY_ENV[name] && process.env[KEY_ENV[name]!]) console.log(`${KEY_ENV[name]} is also set in this shell, and wins over the file.`);
} else if (cmd === 'remove') {
  if (!name || !NAME.test(name)) usage();
  mkdirSync(home, { recursive: true, mode: 0o700 });
  saveKey(home, name, null);
  console.log(`Removed ${name} from ${home}/keys.json.`);
  if (KEY_ENV[name] && process.env[KEY_ENV[name]!]) console.log(`${KEY_ENV[name]} is still set in this shell.`);
} else usage();
