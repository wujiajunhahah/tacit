// Wire contract between the extension, the harness daemon, and agents.

import type { Calibration } from './calibrate';
import type { DecisionRequest, DecisionResponse } from './decision';
import type { LedgerEntry } from './ledger';
import type { Packet } from './packet';
import type { Intent, PageKind, PageModel, Read, Visit } from './types';

export const HARNESS_PORT = 7766;
export const HARNESS_ORIGIN = `http://127.0.0.1:${HARNESS_PORT}`;
export const HARNESS_VERSION = '0.2.0';

/**
 * - page: a visit started, or the page model changed (SPA navigation, feed grew).
 * - visit: the visit was updated (dwell, scroll, selections, copies, clicks, end). Always the full Visit.
 * - ledger: an action the harness took changed state.
 */
export type IngestEvent =
  | { kind: 'page'; page: PageModel; visit: Visit }
  | { kind: 'visit'; visit: Visit }
  | { kind: 'ledger'; entry: LedgerEntry };

export interface IngestRequest {
  events: IngestEvent[];
}

export interface IngestResponse {
  ok: true;
  accepted: number;
}

/** One engine, in the order the harness asks them. */
export interface EngineInfo {
  /** "jev", "openrouter", "ollama", a name from models.json, or "local", the code engine. */
  id: string;
  label: string;
  model?: string;
  /** Whether a request to it stays on this machine. */
  here: boolean;
  /** Where requests go, when they leave this machine. */
  host?: string;
}

/** Who decides, and whether a decision can leave this machine. */
export interface DecisionsInfo {
  /** "local": only engines on this machine are asked. */
  privacy: 'cloud' | 'local';
  /** Asked in order: the next when one fails or is slow. The code engine always ends it. */
  chain: EngineInfo[];
  /** Asked again about a choice the first answer was unsure of. */
  escalate?: EngineInfo;
  /** Configured but not asked: no key for it, or it is off this machine and privacy is local. */
  skipped: { id: string; reason: 'no-key' | 'privacy' }[];
  /** models.json could not be used, so the harness decides on this machine until it is fixed. */
  problem?: string;
}

export interface LastDecision {
  at: number;
  engine: string;
  model?: string;
  latencyMs: number;
  /** A later engine answered because an earlier one failed or was slow. */
  fellBack: boolean;
  escalated: boolean;
}

export interface HealthResponse {
  ok: true;
  name: 'tacit-harness';
  version: string;
  /** HMAC-SHA256(token, challenge) when asked with ?challenge=: proof that this is the user's own harness. */
  proof?: string;
  /** Whether the request carried the token. The fields below come only with it. */
  authorized: boolean;
  /** The first engine asked (DecisionsInfo has them all). */
  engine?: string;
  model?: string;
  decisions?: DecisionsInfo;
  /** The latest decision since the harness started: who answered, and how fast. */
  lastDecision?: LastDecision;
  visits?: number;
  pages?: number;
  /** When something was last deleted. A client that keeps its own copy of the trail asks /v1/forgotten. */
  forgetAt?: number;
}

/**
 * GET /v1/events: what happens in the ledger, as server-sent events (`id`, `event: <kind>`, `data: <json>`), for
 * other harnesses to follow. `Last-Event-ID` or `?since=` replays what was missed. A deletion never names its pages.
 */
export type TacitEvent = { id: number; at: number } & (
  | {
      kind: 'visit';
      visit: {
        id: string;
        url: string;
        title: string;
        startedAt: number;
        endedAt?: number;
        arrival: Visit['arrival']['kind'];
        searchQuery?: string;
        /** What the user said they are after, if they did. */
        stated?: string;
        dwellMs: number;
        reads: number;
        selections: number;
      };
    }
  | { kind: 'page'; page: { url: string; title: string; kind: PageKind; blocks: number } }
  | { kind: 'action'; action: Pick<LedgerEntry, 'id' | 'kind' | 'state' | 'label' | 'url'> }
  | { kind: 'forgotten'; all: boolean; pages: number }
);

/** GET /v1/forgotten?since=: what was deleted after `since`, so every copy of the trail forgets it. */
export interface ForgottenResponse {
  /** The latest deletion; send it as `since` next time. */
  at: number;
  /** Everything from before this time was deleted. */
  all?: number;
  /** Pages deleted one by one, by `forgetKey(url)`: their visits and actions from before `at` are gone. */
  pages: { key: string; at: number }[];
}

export interface CurrentContextResponse {
  visit: Visit | null;
  page: PageModel | null;
  intent: Intent;
  packet: Packet | null;
  /** When the extension last heard from the user on that visit: a tab left open for a day is not "now". */
  activeAt?: number;
}

export interface TrailItem {
  visit: Visit;
  /** Human sentence for how the user arrived, from describeArrival(). */
  arrival: string;
}

export interface SearchHit {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  score: number;
  lastSeen: number;
}

export interface PageResponse {
  page: PageModel;
  visits: Visit[];
}

export type DecideRequest = DecisionRequest;
export type DecideResponse = DecisionResponse;

// The dashboard: recorded pages as a context library.

export type PageSort = 'recent' | 'attention' | 'relevance';

/** One recorded page as a library entry, with what the user gave it. */
export interface PageSummary {
  url: string;
  title: string;
  domain: string;
  kind: PageKind;
  /** When the first kept visit started. */
  firstSeen: number;
  /** When the user was last active on the page, not when the harness heard about it. */
  lastSeen: number;
  visits: number;
  /** Focused time across all visits. */
  dwellMs: number;
  /** Time on passages read closely, across all visits. */
  readMs: number;
  /** Distinct passages read closely. */
  reads: number;
  selections: number;
  copies: number;
  /** The best-matching passage, when the library was searched. */
  snippet?: string;
}

/** GET /v1/pages?q=&site=&sort=&limit=&offset= */
export interface PagesResponse {
  pages: PageSummary[];
  total: number;
  offset: number;
  limit: number;
}

/** A passage read closely, summed over every visit to its page. */
export interface ReadPassage {
  blockId: string;
  text: string;
  ms: number;
  via: Read['via'];
  at: number;
}

/** GET /v1/page?url= */
export interface PageDetailResponse extends PageResponse {
  summary: PageSummary;
  /** In page order. */
  reads: ReadPassage[];
  /** What the user seemed to be doing on this page, inferred from its own visits. */
  intent: Intent;
  /** This page's context, ready to hand to an agent. */
  packet: Packet;
  /** What Tacit did on this page, newest first. */
  actions: LedgerEntry[];
}

/** GET /v1/stats */
export interface StatsResponse {
  pages: number;
  visits: number;
  actions: number;
  dwellMs: number;
  readMs: number;
  /** When the oldest kept visit started. */
  since: number | null;
  /** Sites by number of pages, most first. */
  sites: { domain: string; pages: number }[];
  /** `display` abbreviates the home folder as ~. */
  storage: { path: string; display: string; bytes: number };
}

/** POST /v1/brief: a short note about the user's screen for an agent, only when the request needs one. */
export interface BriefRequest {
  /** The request the agent is about to answer; without one, the note is given unasked. */
  prompt?: string;
}

export interface BriefResponse {
  inject: boolean;
  /**
   * pointing: the request points at the screen ("this page"); model: a decision model judged it relevant; asked: no
   * request to judge; unrelated, stale (nothing open lately) and empty (nothing recorded) give no note.
   */
  reason: 'pointing' | 'model' | 'asked' | 'unrelated' | 'stale' | 'empty';
  text?: string;
  tokens?: number;
  /** The model's yes-probability, when one was asked. */
  p?: number;
}

/** GET /v1/connect */
export interface ConnectResponse {
  engine: string;
  model?: string;
  decisions: DecisionsInfo;
  /** Where who decides is set, with the home folder as ~. */
  modelsFile: string;
  /** Absolute path of the MCP server on this machine. */
  mcpPath: string;
  /** `tacit` with absolute paths, as any agent can run it. */
  cli: string;
  /** The line for an agent's instructions file (AGENTS.md, GEMINI.md…) that tells it when to run `cli`. */
  agentLine: string;
  /** Adds Tacit to Claude Code for every project. */
  claudeCommand: string;
  /** The same server for Cursor, Claude Desktop and other MCP clients' config files. */
  mcpConfig: { mcpServers: { tacit: { command: string; args: string[]; env?: Record<string, string> } } };
}

/** GET /v1/calibration */
export type CalibrationResponse = Calibration;

/** DELETE /v1/page?url= and DELETE /v1/all */
export interface DeleteResponse {
  ok: true;
  deleted: { pages: number; visits: number; actions: number };
}
