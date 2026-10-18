// When the harness acts, suggests, or asks. Confidence thresholds are interface design.

export type Mode = 'act' | 'suggest' | 'ask';

export interface Thresholds {
  act: number;
  suggest: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { act: 0.6, suggest: 0.35 };

export function modeFor(confidence: number, t: Thresholds = DEFAULT_THRESHOLDS): Mode {
  if (confidence >= t.act) return 'act';
  if (confidence >= t.suggest) return 'suggest';
  return 'ask';
}

/** Acting needs both a clear intent and a clear action, so the two multiply. */
export function combinedConfidence(intentConfidence: number, actionConfidence: number): number {
  return Math.max(0, intentConfidence) * Math.max(0, actionConfidence);
}
