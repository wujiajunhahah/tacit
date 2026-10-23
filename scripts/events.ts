// Follows what happens in your ledger and prints it as JSON lines, for any harness or script to read:
//   bun run events | your-agent
// The harness must first prove it is yours; replays from --since=<id> when given.
// Usage: bun run events [--since=<id>]

import { HARNESS_ORIGIN, authHeader, provesToken } from '../core';
import { readToken } from '../daemon/auth';
import { tacitHome } from '../daemon/db';

const token = readToken(tacitHome());
if (!token || !(await provesToken(HARNESS_ORIGIN, token))) {
  console.error('The harness is not running, or not yours. Start it with: bun run harness');
  process.exit(1);
}
const since = process.argv.find((a) => a.startsWith('--since='))?.slice(8);
const res = await fetch(`${HARNESS_ORIGIN}/v1/events${since ? `?since=${encodeURIComponent(since)}` : ''}`, { headers: authHeader(token) });
if (!res.ok || !res.body) {
  console.error(`The harness answered ${res.status}.`);
  process.exit(1);
}

const dec = new TextDecoder();
let buf = '';
for await (const chunk of res.body) {
  buf += dec.decode(chunk, { stream: true });
  for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
    const data = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
    buf = buf.slice(i + 2);
    if (data) console.log(data.slice(6));
  }
}
