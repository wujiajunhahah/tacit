import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../../daemon/db';
import { EMPTY_LEDGER } from '../../daemon/format';
import { removeHome, seedTrail, tempHome } from './helpers';

const MCP = join(import.meta.dir, '../../daemon/mcp.ts');

async function connect(home: string): Promise<Client> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [MCP], env: { TACIT_HOME: home }, stderr: 'pipe' });
  const client = new Client({ name: 'tacit-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  expect(res.isError).toBeFalsy();
  const [first] = res.content as { type: string; text: string }[];
  return first?.text ?? '';
}

describe('MCP server', () => {
  const seed = seedTrail();
  let home: string;
  let emptyHome: string;
  let client: Client;
  let emptyClient: Client;

  beforeAll(async () => {
    home = tempHome();
    emptyHome = tempHome();
    const store = new Store({ home });
    store.ingest(seed.events);
    store.close();
    [client, emptyClient] = await Promise.all([connect(home), connect(emptyHome)]);
  });

  afterAll(async () => {
    await Promise.all([client.close(), emptyClient.close()]);
    removeHome(home);
    removeHome(emptyHome);
  });

  test('lists the five read-only tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['tacit_current_context', 'tacit_intent', 'tacit_page', 'tacit_search', 'tacit_trail']);
    for (const t of tools) {
      expect(t.description?.length).toBeGreaterThan(80);
      expect(t.annotations?.readOnlyHint).toBe(true);
    }
    const context = tools.find((t) => t.name === 'tacit_current_context');
    expect(context?.description).toContain("'this page'");
  });

  test('tacit_current_context returns the packet', async () => {
    const text = await call(client, 'tacit_current_context');
    expect(text).toContain('# Context: Context is the new interface');
    expect(text).toContain('**How I got here:** searched “decision latency”');
  });

  test('tacit_intent, tacit_trail, tacit_search and tacit_page read the same ledger', async () => {
    expect(await call(client, 'tacit_intent')).toContain('Confidence:');
    const trail = await call(client, 'tacit_trail', { limit: 2 });
    expect(trail).toContain('1. Context is the new interface');
    expect(trail).toContain('Arrived: searched “decision latency”');
    expect(trail).not.toContain('3. ');
    expect(await call(client, 'tacit_search', { query: '上下文' })).toContain(seed.zh.url);
    const page = await call(client, 'tacit_page', { url: seed.article.url, max_chars: 600 });
    expect(page).toStartWith('# Context is the new interface');
    expect(page).toContain('## Why interfaces got old');
    expect(page).toContain('[Truncated at 600');
    expect(await call(client, 'tacit_page', { url: 'https://nowhere.example/' })).toContain('Tacit has no copy');
  });

  test('an empty ledger answers with one helpful sentence, not an error', async () => {
    expect(await call(emptyClient, 'tacit_current_context')).toBe(EMPTY_LEDGER);
    expect(await call(emptyClient, 'tacit_trail')).toBe(EMPTY_LEDGER);
    expect(await call(emptyClient, 'tacit_search', { query: 'latency' })).toBe(EMPTY_LEDGER);
  });
});
