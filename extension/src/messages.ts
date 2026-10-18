import type { Click, DecisionRequest, DecisionResponse, Intent, LedgerEntry, PageModel, Visit } from '../../core';
import type { Settings } from './settings';

export type VisitPatch = Partial<Pick<Visit, 'title' | 'dwellMs' | 'maxScroll' | 'selections' | 'copies' | 'clicks' | 'endedAt'>>;

export interface PendingClick extends Click {
  viaTacit?: boolean;
}

export type ToBackground =
  | { type: 'visit:start'; visitId: string; url: string; title: string; referrer: string; page: PageModel; startedAt: number }
  | { type: 'visit:update'; visitId: string; patch: VisitPatch }
  | { type: 'page:update'; visitId: string; page: PageModel }
  | { type: 'click'; click: PendingClick }
  | { type: 'intent:state'; visitId: string; text: string }
  | { type: 'decide'; request: DecisionRequest }
  | { type: 'ledger'; entry: LedgerEntry }
  | { type: 'status' };

export interface HarnessStatus {
  connected: boolean;
  engine: 'jev' | 'local';
  model?: string;
}

export interface VisitStartReply {
  visit: Visit;
  intent: Intent;
  /** Up to five earlier visits, oldest first. */
  trailTail: Visit[];
  visitedUrls: string[];
  harness: HarnessStatus;
}

export interface IntentReply {
  intent: Intent;
  visit?: Visit;
}

export interface DecideReply {
  response: DecisionResponse;
}

export interface StatusReply {
  harness: HarnessStatus;
  settings: Settings;
  visits: number;
  queued: number;
  currentTitle?: string;
}

export type ToContent = { type: 'tacit:navigated'; url: string };

export async function send<T>(msg: ToBackground): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(msg)) as T | { error: string } | undefined;
  if (!reply) throw new Error(`No reply to ${msg.type}`);
  if (typeof reply === 'object' && reply !== null && 'error' in reply) throw new Error(reply.error);
  return reply as T;
}
