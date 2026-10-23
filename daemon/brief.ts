// The note an agent gets about the user's screen, and whether it gets one (core/brief.ts says when). A request that
// points at the screen gets it; one that does not, while the user has been browsing lately, goes to a decision model
// for a yes or no, within a budget a prompt can afford. Anything slower, or unsure, gets no note: a missing note costs
// the agent one call to `tacit now`, a wrong one costs every user tokens they did not want to spend.

import { estimateTokens, gateRequest, refersToScreen, type BriefResponse, type DecisionEngine } from '../core';
import type { Store } from './db';
import { formatBrief, lastActive, type Port } from './format';
import { currentContext } from './queries';

/** Longer than this without the browser, and only a request that points at the screen gets the note. */
export const FRESH_MS = 30 * 60_000;
/**
 * What the yes/no question may take: hooks run before every prompt. Through a proxy Jev usually answered in about
 * 0.5 s and now and then took over 1.5 s; a tighter budget missed the very prompts that needed the note, and an
 * agent's own answer takes seconds more anyway. It is only ever spent while the user has been browsing lately.
 */
export const GATE_MS = 2500;
const YES = 0.6;

export interface BriefOptions {
  prompt?: string;
  /** Asked the yes/no question; without one (or with only the code engine), only pointing words count. */
  engine?: DecisionEngine;
  port?: Port;
  now?: number;
}

export async function brief(store: Store, opts: BriefOptions = {}): Promise<BriefResponse> {
  const now = opts.now ?? Date.now();
  const ctx = currentContext(store);
  const v = ctx.visit;
  if (!v) return { inject: false, reason: 'empty' };
  const text = formatBrief(ctx, now, opts.port);
  const note = (reason: BriefResponse['reason'], p?: number): BriefResponse => ({ inject: true, reason, text, tokens: estimateTokens(text), ...(p === undefined ? {} : { p }) });
  const prompt = opts.prompt?.trim();
  if (!prompt) return note('asked');
  if (refersToScreen(prompt)) return note('pointing');
  if (now - lastActive(ctx) > FRESH_MS) return { inject: false, reason: 'stale' };
  if (!opts.engine || opts.engine.name === 'local') return { inject: false, reason: 'unrelated' };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await Promise.race([
      opts.engine.decide(gateRequest(prompt, { title: v.title || v.url, url: v.url, intent: ctx.intent.text })),
      new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), GATE_MS))),
    ]);
    // The code engine answering means every model failed; its yes/no on a request means nothing.
    const answer = res && res.engine !== 'local' ? res.answers.relevant : undefined;
    const p = answer?.type === 'noul' ? answer.noul : undefined;
    return p !== undefined && p >= YES ? note('model', p) : { inject: false, reason: 'unrelated', ...(p === undefined ? {} : { p }) };
  } catch {
    return { inject: false, reason: 'unrelated' };
  } finally {
    clearTimeout(timer);
  }
}
