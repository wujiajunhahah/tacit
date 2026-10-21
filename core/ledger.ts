// Stable semantics for everything the harness does on the user's behalf.
// Interfaces may differ per person; "suggested", "confirmed" and "executed" may not.

export type ActionState = 'suggested' | 'confirmed' | 'executed' | 'undone' | 'dismissed';
export type LedgerKind = 'jump' | 'navigate' | 'copy' | 'focus' | 'fold' | 'handoff' | 'intent';

export interface LedgerEntry {
  id: string;
  /** The latest state change. */
  at: number;
  /** When the action was first proposed; deletions are judged by this, since `at` moves with every change. */
  createdAt?: number;
  kind: LedgerKind;
  label: string;
  state: ActionState;
  url: string;
  reason: string;
  confidence?: number;
  engine?: string;
  undoable: boolean;
}

const ALLOWED: Record<ActionState, ActionState[]> = {
  suggested: ['confirmed', 'dismissed'],
  confirmed: ['executed', 'dismissed'],
  executed: ['undone'],
  undone: [],
  dismissed: [],
};

export function canTransition(from: ActionState, to: ActionState): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(entry: LedgerEntry, to: ActionState, at = Date.now()): LedgerEntry {
  if (!canTransition(entry.state, to)) throw new Error(`Illegal transition ${entry.state} → ${to} for ${entry.kind}`);
  if (to === 'undone' && !entry.undoable) throw new Error(`${entry.kind} cannot be undone`);
  return { ...entry, state: to, at };
}

export const STATE_LABEL: Record<ActionState, string> = {
  suggested: 'Suggested',
  confirmed: 'Confirmed',
  executed: 'Done',
  undone: 'Undone',
  dismissed: 'Dismissed',
};
