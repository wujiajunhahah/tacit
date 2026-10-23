// Pairs a browser with the harness. First the harness on 127.0.0.1 must prove it holds this user's token (it is not
// sent); then the pairing page opens with the token in the URL fragment, which the browser keeps to itself.
// The token is never printed: an agent running this would carry it into its transcript.
// Usage: bun run pair

import { HARNESS_ORIGIN, provesToken } from '../core';
import { readToken } from '../daemon/auth';
import { tacitHome } from '../daemon/db';

const home = tacitHome();
const token = readToken(home);
if (!token) {
  console.error('There is no token yet. Start the harness once (bun run harness), then run this again.');
  process.exit(1);
}
if (!(await provesToken(HARNESS_ORIGIN, token))) {
  console.error(`Nothing at ${HARNESS_ORIGIN} proved it is the harness for ${home}.`);
  console.error('Start it with bun run harness. If something is already listening there, stop that first.');
  process.exit(1);
}

const url = `${HARNESS_ORIGIN}/pair#${token}`;
const open = (cmd: string[]) => Bun.spawnSync(cmd, { stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
// The extension usually lives in Chrome, which may not be the default browser.
const opened =
  process.platform === 'darwin'
    ? open(['open', '-a', 'Google Chrome', url]) || open(['open', url])
    : process.platform === 'win32'
      ? open(['cmd', '/c', 'start', '', url])
      : open(['xdg-open', url]);
console.log(
  opened
    ? 'Opened the pairing page. It says when the extension is paired; if your browser with Tacit is another one, open the page there.'
    : `Open ${HARNESS_ORIGIN}/pair# followed by the token in ${home}/token, in the browser with Tacit.`,
);
