// Tacit for OpenCode. OpenCode runs no command before a prompt; its plugins see each message before it is stored. This
// one asks `tacit brief` about the message, the question every other agent's hook asks, and adds the note as a part the
// user does not see. `bun run setup` puts a two-line plugin in OpenCode's plugins folder that loads this file.

/** The parts of OpenCode's plugin API used here (@opencode-ai/plugin, October 2026). */
interface Part {
  type: string;
  text?: string;
  synthetic?: boolean;
  [key: string]: unknown;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** An id in OpenCode's own form for parts: "prt_", the time, then randomness, so parts sort by when they were made. */
function partId(now = Date.now()): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => BASE62[b % 62]).join('');
  return `prt_${(BigInt(now) * 0x1000n).toString(16).padStart(12, '0').slice(-12)}${random}`;
}

/** The plugin, given the command that runs `tacit` (absolute paths: OpenCode's PATH is not the user's shell's). */
export function tacitPlugin(command: string[]) {
  return async () => ({
    'chat.message': async (input: { sessionID: string }, output: { message: { id: string }; parts: Part[] }) => {
      const prompt = output.parts
        .filter((p) => p.type === 'text' && !p.synthetic && p.text)
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (!prompt) return;
      try {
        const proc = Bun.spawn([...command, 'brief', '--json'], { stdin: new Blob([prompt]), stdout: 'pipe', stderr: 'ignore', timeout: 5000 });
        const res = JSON.parse(await new Response(proc.stdout).text()) as { inject?: boolean; text?: string };
        if (res.inject && res.text) output.parts.push({ id: partId(), sessionID: input.sessionID, messageID: output.message.id, type: 'text', text: res.text, synthetic: true });
      } catch {
        // No note: a plugin must never stand in the way of a message.
      }
    },
  });
}
