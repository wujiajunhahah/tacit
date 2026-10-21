// Reading attention: which passages the user lingered on, and for how long.
// Time in the middle of the viewport is a quiet signal that is always on; time under the pointer is
// stronger and opt-in, for people who read with the mouse.

import { readImportance } from './intent';
import { clip } from './text';
import type { Read } from './types';

export interface AttentionOptions {
  /** Pointer time on a passage before it counts as read closely. */
  pointerDwellMs: number;
  /** In-view time on a passage before it counts as read. */
  viewDwellMs: number;
  maxReads: number;
}

export const DEFAULT_ATTENTION: AttentionOptions = { pointerDwellMs: 1200, viewDwellMs: 4000, maxReads: 30 };
export const POINTER_DWELL_RANGE: [number, number] = [600, 4000];

const VIA_WEIGHT = { pointer: 1.2, view: 0.5 };

export class AttentionLedger {
  private readonly view = new Map<string, number>();
  private readonly pointer = new Map<string, number>();
  private readonly last = new Map<string, number>();

  constructor(private opts: AttentionOptions = DEFAULT_ATTENTION) {}

  configure(opts: Partial<AttentionOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  /**
   * Time with these passages in the reading band, shared between them: people read one passage at a
   * time. `weights` (how much of the band each fills) say where the eyes most likely are; equal without.
   */
  addView(ids: string[], ms: number, at: number, weights?: number[]): void {
    if (ids.length === 0 || ms <= 0) return;
    const w = ids.map((_, i) => Math.max(0, weights?.[i] ?? 1));
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    ids.forEach((id, i) => {
      if (!w[i]) return;
      this.view.set(id, (this.view.get(id) ?? 0) + (ms * w[i]!) / total);
      this.last.set(id, at);
    });
  }

  addPointer(id: string, ms: number, at: number): void {
    if (ms <= 0) return;
    this.pointer.set(id, (this.pointer.get(id) ?? 0) + ms);
    this.last.set(id, at);
  }

  /** Passages past their threshold, most important first. */
  reads(textOf: (id: string) => string | undefined): Read[] {
    const out: Read[] = [];
    for (const id of new Set([...this.view.keys(), ...this.pointer.keys()])) {
      const text = textOf(id);
      if (!text) continue;
      const p = this.pointer.get(id) ?? 0;
      const v = this.view.get(id) ?? 0;
      const at = this.last.get(id) ?? 0;
      if (p >= this.opts.pointerDwellMs) out.push({ blockId: id, text: clip(text, 300), ms: Math.round(p), via: 'pointer', at });
      else if (v >= this.opts.viewDwellMs) out.push({ blockId: id, text: clip(text, 300), ms: Math.round(v), via: 'view', at });
    }
    const weight = (r: Read) => VIA_WEIGHT[r.via] * readImportance(r.ms);
    return out.sort((a, b) => weight(b) - weight(a)).slice(0, this.opts.maxReads);
  }
}

export function clampPointerDwell(ms: number): number {
  const [lo, hi] = POINTER_DWELL_RANGE;
  return Math.min(hi, Math.max(lo, Math.round(ms / 100) * 100));
}
