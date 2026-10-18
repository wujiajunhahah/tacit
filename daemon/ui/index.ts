// The ledger UI: the HTML shell with the client bundle inlined, built once per process.

import { join } from 'node:path';
import { shell } from './shell';

let client: Promise<string> | null = null;

async function buildClient(): Promise<string> {
  const out = await Bun.build({ entrypoints: [join(import.meta.dir, 'app.ts')], target: 'browser', minify: true });
  const js = out.outputs[0];
  if (!out.success || !js) throw new Error(`UI build failed: ${out.logs.join('\n')}`);
  return (await js.text()).replaceAll('</script', '<\\/script');
}

export async function renderUi(nonce: string): Promise<string> {
  client ??= buildClient().catch((err: unknown) => {
    client = null;
    throw err;
  });
  return shell(nonce, await client);
}
