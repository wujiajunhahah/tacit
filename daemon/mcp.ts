// Tacit over MCP (stdio): agents read the user's browsing context from the local ledger; logs go to stderr only.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { HARNESS_VERSION } from '../core';
import { Store, tacitHome } from './db';
import { EMPTY_LEDGER, formatContext, formatIntent, formatPage, formatSearch, formatTrail } from './format';
import * as queries from './queries';

const INSTRUCTIONS =
  'Tacit records what the user reads in their browser (pages, how they got there, selections, copies, searches) on their machine. ' +
  "Use it instead of asking the user to copy and paste: when they mention 'this page', 'what I'm reading' or something they saw earlier, read it from Tacit first.";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

function reply(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

export function createMcpServer(store: Store): McpServer {
  const server = new McpServer({ name: 'tacit', version: HARNESS_VERSION }, { instructions: INSTRUCTIONS });
  const empty = () => store.counts().visits === 0;

  server.registerTool(
    'tacit_current_context',
    {
      title: 'What the user is looking at',
      description:
        'The page the user has open in their browser right now, as compact markdown: what they seem to be trying to do, how they got there, ' +
        'what they selected, the most relevant passages and the page outline (far fewer tokens than the whole page). ' +
        "Call this first when the user says 'this page', 'this article', 'this doc', 'what I'm reading', 'here', or refers to anything on their screen without pasting it.",
      inputSchema: {
        max_passages: z.number().int().min(1).max(10).optional().describe('How many relevant passages to include (default 5).'),
      },
      annotations: READ_ONLY,
    },
    ({ max_passages }) =>
      reply(empty() ? EMPTY_LEDGER : formatContext(queries.currentContext(store, { maxPassages: max_passages }))),
  );

  server.registerTool(
    'tacit_intent',
    {
      title: 'What the user is trying to do',
      description:
        "The user's current goal, inferred from their recent searches, selections, copies and reading (or stated by them), " +
        'with a confidence, the evidence behind it and other possible readings. ' +
        "Call this when a request is vague ('help me with this', 'what next', 'continue') or before acting on a guess about their goal.",
      annotations: READ_ONLY,
    },
    () => reply(empty() ? EMPTY_LEDGER : formatIntent(queries.intent(store))),
  );

  server.registerTool(
    'tacit_trail',
    {
      title: 'Pages the user visited recently',
      description:
        'The pages the user visited recently, newest first: title, URL, how they arrived (the search or link that led there), ' +
        'how long they read, and what they selected or copied. ' +
        "Call this when the user refers to something seen earlier ('the article from before', 'that docs page I had open') " +
        'or when you need the path that led to the current problem.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).default(10).describe('How many visits to return, newest first.'),
      },
      annotations: READ_ONLY,
    },
    ({ limit }) => reply(formatTrail(queries.trail(store, limit))),
  );

  server.registerTool(
    'tacit_search',
    {
      title: 'Search what the user has read',
      description:
        'Full-text search, in English or Chinese, over the pages the user has read. Returns titles, URLs and the best matching passage. ' +
        "Call this when the user mentions something they read but you do not know which page ('the post about rate limits', " +
        "'我之前看的那篇讲上下文的文章'); follow up with tacit_page for the full text.",
      inputSchema: {
        query: z.string().min(1).describe('Words to look for, in any language.'),
        limit: z.number().int().min(1).max(20).default(8).describe('Maximum number of pages to return.'),
      },
      annotations: READ_ONLY,
    },
    ({ query, limit }) => reply(empty() ? EMPTY_LEDGER : formatSearch(query, queries.search(store, query, limit))),
  );

  server.registerTool(
    'tacit_page',
    {
      title: 'Full text of a page the user read',
      description:
        'The full readable text of a page the user visited, as markdown with headings, plus when and how long they read it. ' +
        'Only pages the user actually visited are available. Call this after tacit_search or tacit_trail ' +
        'when the passages from tacit_current_context are not enough.',
      inputSchema: {
        url: z.string().min(1).describe('The exact URL, as returned by tacit_trail or tacit_search.'),
        max_chars: z.number().int().min(500).max(200_000).default(12_000).describe('Cut the text after this many characters.'),
      },
      annotations: READ_ONLY,
    },
    ({ url, max_chars }) => {
      const res = queries.page(store, url);
      if (res) return reply(formatPage(res, max_chars));
      return reply(`Tacit has no copy of ${url}. Only pages the user opened with the extension on are stored; use tacit_search or tacit_trail to find one.`);
    },
  );

  return server;
}

if (import.meta.main) {
  const store = new Store({ home: tacitHome() });
  await createMcpServer(store).connect(new StdioServerTransport());
  console.error(`[tacit-mcp] serving ${store.path}`);
}
