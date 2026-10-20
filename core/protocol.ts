// Wire contract between the extension, the harness daemon, and agents.

import type { DecisionRequest, DecisionResponse } from './decision';
import type { LedgerEntry } from './ledger';
import type { Packet } from './packet';
import type { Intent, PageModel, Visit } from './types';

export const HARNESS_PORT = 7766;
export const HARNESS_ORIGIN = `http://127.0.0.1:${HARNESS_PORT}`;
export const HARNESS_VERSION = '0.1.1';

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

export interface HealthResponse {
  ok: true;
  name: 'tacit-harness';
  version: string;
  engine: 'jev' | 'local';
  model?: string;
  visits: number;
  pages: number;
}

export interface CurrentContextResponse {
  visit: Visit | null;
  page: PageModel | null;
  intent: Intent;
  packet: Packet | null;
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
