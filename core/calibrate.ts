// The feedback loop: what the user did with past suggestions tunes when Tacit acts and where it folds.

import type { LedgerEntry } from './ledger';
import { DEFAULT_THRESHOLDS, type Thresholds } from './policy';
import { domainOf } from './text';

export type CalibrationChange =
  | { kind: 'act-raised' | 'act-lowered'; from: number; to: number; undone: number; total: number }
  | { kind: 'folds-off'; domain: string; dismissed: number; total: number };

export interface Calibration {
  thresholds: Thresholds;
  /** Domain → whether Tacit may fold posts there. Domains not listed fold as usual. */
  folds: Record<string, boolean>;
  /** One English sentence per change, for logs and agents. */
  notes: string[];
  /** The same changes, structured, for localized rendering. */
  changes: CalibrationChange[];
  sample: { executed: number; undone: number; dismissedFolds: number; keptFolds: number };
}

const ACTIONS = new Set(['jump', 'navigate', 'copy']);
const RECENT = 60;
const FOLD_MEMORY_MS = 7 * 24 * 60 * 60_000;
const ACT_BOUNDS: [number, number] = [0.5, 0.8];
const STEP = 0.05;
/** Prior: assume one undo in four confident actions until the user shows otherwise. */
const PRIOR_UNDONE = 1;
const PRIOR_KEPT = 3;

const round = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, x));

function actChange(entries: LedgerEntry[], base: Thresholds): { act: number; change?: CalibrationChange; executed: number; undone: number } {
  const confident = entries
    .filter((e) => ACTIONS.has(e.kind) && (e.state === 'executed' || e.state === 'undone') && (e.confidence ?? 0) >= base.act)
    .slice(-RECENT);
  const undone = confident.filter((e) => e.state === 'undone').length;
  const executed = confident.length - undone;
  const rate = (undone + PRIOR_UNDONE) / (confident.length + PRIOR_UNDONE + PRIOR_KEPT);
  let act = base.act;
  // One step per 10 points of undo rate above 30%; the epsilon keeps 40% at one step ((0.4 − 0.3) / 0.1 > 1 in floats).
  if (confident.length >= 5 && rate > 0.3) act = base.act + STEP * Math.min(3, Math.ceil((rate - 0.3) / 0.1 - 1e-9));
  else if (confident.length >= 10 && rate < 0.12) act = base.act - STEP;
  act = round(clamp(act, ACT_BOUNDS));
  if (act === base.act) return { act, executed, undone };
  return { act, executed, undone, change: { kind: act > base.act ? 'act-raised' : 'act-lowered', from: base.act, to: act, undone, total: confident.length } };
}

function foldChanges(entries: LedgerEntry[], now: number): { folds: Record<string, boolean>; changes: CalibrationChange[]; dismissed: number; kept: number } {
  const byDomain = new Map<string, LedgerEntry[]>();
  let dismissed = 0;
  let kept = 0;
  for (const e of entries) {
    if (e.kind !== 'fold' || now - e.at > FOLD_MEMORY_MS) continue;
    if (e.state === 'dismissed') dismissed++;
    else kept++;
    const d = domainOf(e.url);
    byDomain.set(d, [...(byDomain.get(d) ?? []), e]);
  }
  const folds: Record<string, boolean> = {};
  const changes: CalibrationChange[] = [];
  for (const [domain, list] of byDomain) {
    const last = list.sort((a, b) => a.at - b.at).slice(-3);
    const off = last.filter((e) => e.state === 'dismissed').length;
    if (off >= 2) {
      folds[domain] = false;
      changes.push({ kind: 'folds-off', domain, dismissed: off, total: last.length });
    }
  }
  return { folds, changes, dismissed, kept };
}

function note(c: CalibrationChange): string {
  if (c.kind === 'folds-off') return `Stopped folding on ${c.domain}: you unfolded ${c.dismissed} of the last ${c.total} times.`;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return c.kind === 'act-raised'
    ? `Acting less eagerly (${pct(c.from)} → ${pct(c.to)}): you undid ${c.undone} of ${c.total} confident actions.`
    : `Acting a little sooner (${pct(c.from)} → ${pct(c.to)}): ${c.total - c.undone} of ${c.total} confident actions stuck.`;
}

export function calibrate(entries: LedgerEntry[], base: Thresholds = DEFAULT_THRESHOLDS, now = Date.now()): Calibration {
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  const act = actChange(sorted, base);
  const fold = foldChanges(sorted, now);
  const changes = [...(act.change ? [act.change] : []), ...fold.changes];
  return {
    thresholds: { act: act.act, suggest: Math.min(base.suggest, act.act - 0.1) },
    folds: fold.folds,
    notes: changes.map(note),
    changes,
    sample: { executed: act.executed, undone: act.undone, dismissedFolds: fold.dismissed, keptFolds: fold.kept },
  };
}

export function foldsAllowed(c: Pick<Calibration, 'folds'> | undefined, url: string): boolean {
  return c?.folds[domainOf(url)] !== false;
}
