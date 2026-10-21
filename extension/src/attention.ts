// Watches how the user reads, without showing anything: which passages sit in the reading band of the
// viewport, and, when turned on, which passage the pointer rests on.

import { AttentionLedger, DEFAULT_ATTENTION, type Block, type Read } from '../../core';
import { isOwn } from './extract/dom';

export interface AttentionConfig {
  pointer: boolean;
  pointerDwellMs: number;
}

export interface Attention {
  /** Track a (new) set of passages, e.g. after the page re-rendered. */
  observe(elements: Map<string, Element>, blocks: Block[]): void;
  configure(config: AttentionConfig): void;
  reads(): Read[];
  stop(): void;
}

const TICK_MS = 500;
/** The middle 40% of the viewport, where people actually read. */
const BAND = { top: 0.3, bottom: 0.7 };
const READING_BAND = `-${BAND.top * 100}% 0px -${(1 - BAND.bottom) * 100}% 0px`;
/** Faster than this is skimming, not reading. */
const SKIM_PX_PER_S = 1500;
/** Nobody reads for a minute without scrolling, moving or typing; they have walked away. */
const IDLE_MS = 60_000;
/** A resting pointer keeps counting this long after it last moved. */
const POINTER_REST_MS = 4000;
/** Reading with the mouse is slow; faster pointer movement is navigation. */
const POINTER_READING_PX_PER_S = 900;

export function startAttention(initial: AttentionConfig, onChange: () => void): Attention {
  let config = initial;
  const ledger = new AttentionLedger({ ...DEFAULT_ATTENTION, pointerDwellMs: config.pointerDwellMs });
  const texts = new Map<string, string>();
  const watched = new Map<string, Element>();
  const inBand = new Set<string>();
  const ac = new AbortController();
  const opt: AddEventListenerOptions = { capture: true, passive: true, signal: ac.signal };
  let lastActivity = Date.now();
  let lastScroll = { y: window.scrollY, at: 0, speed: 0 };
  let pointer: { id?: string; x: number; y: number; at: number; speed: number } = { x: 0, y: 0, at: 0, speed: 0 };
  let signature = '';

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = e.target.getAttribute('data-tacit-id');
        if (!id) continue;
        if (e.isIntersecting) inBand.add(id);
        else inBand.delete(id);
      }
    },
    { rootMargin: READING_BAND, threshold: 0 },
  );

  window.addEventListener(
    'scroll',
    () => {
      const now = Date.now();
      const dt = Math.max(1, now - lastScroll.at);
      lastScroll = { y: window.scrollY, at: now, speed: (Math.abs(window.scrollY - lastScroll.y) / dt) * 1000 };
      lastActivity = now;
    },
    opt,
  );
  document.addEventListener('keydown', () => (lastActivity = Date.now()), opt);
  document.addEventListener(
    'pointermove',
    (e) => {
      const now = Date.now();
      lastActivity = now;
      if (!config.pointer) return;
      const dt = Math.max(1, now - pointer.at);
      const speed = (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) / dt) * 1000;
      const target = e.target instanceof Element && !isOwn(e.target) ? e.target : null;
      const id = target?.closest('[data-tacit-id]')?.getAttribute('data-tacit-id') ?? undefined;
      pointer = { id: id && texts.has(id) ? id : undefined, x: e.clientX, y: e.clientY, at: now, speed };
    },
    opt,
  );
  document.documentElement.addEventListener('pointerleave', () => (pointer = { ...pointer, id: undefined }), opt);

  /** How many pixels of the reading band a passage fills. */
  const bandShare = (id: string): number => {
    const r = watched.get(id)?.getBoundingClientRect();
    if (!r) return 0;
    return Math.max(0, Math.min(r.bottom, innerHeight * BAND.bottom) - Math.max(r.top, innerHeight * BAND.top));
  };

  const tick = setInterval(() => {
    const now = Date.now();
    if (document.visibilityState !== 'visible' || !document.hasFocus() || now - lastActivity > IDLE_MS) return;
    const skimming = now - lastScroll.at < 300 && lastScroll.speed > SKIM_PX_PER_S;
    if (!skimming) {
      const ids = [...inBand].filter((id) => texts.has(id));
      ledger.addView(ids, TICK_MS, now, ids.map(bandShare));
    }
    const resting = now - pointer.at < POINTER_REST_MS && pointer.speed < POINTER_READING_PX_PER_S;
    if (config.pointer && pointer.id && resting) ledger.addPointer(pointer.id, TICK_MS, now);
    const next = ledger
      .reads((id) => texts.get(id))
      .map((r) => `${r.blockId}:${r.via}:${Math.floor(r.ms / 2000)}`)
      .join(',');
    if (next !== signature) {
      signature = next;
      onChange();
    }
  }, TICK_MS);

  return {
    observe(elements, blocks) {
      // Feeds re-render often: keep watching what is still there, so time in the reading band is not lost.
      texts.clear();
      for (const b of blocks) if (b.kind !== 'heading') texts.set(b.id, b.text);
      for (const [id, el] of watched) {
        if (elements.get(id) === el && texts.has(id)) continue;
        io.unobserve(el);
        watched.delete(id);
        inBand.delete(id);
      }
      for (const [id, el] of elements) {
        if (watched.has(id) || !texts.has(id)) continue;
        io.observe(el);
        watched.set(id, el);
      }
    },
    configure(next) {
      config = next;
      ledger.configure({ pointerDwellMs: next.pointerDwellMs });
      if (!next.pointer) pointer = { ...pointer, id: undefined };
    },
    reads: () => ledger.reads((id) => texts.get(id)),
    stop() {
      clearInterval(tick);
      io.disconnect();
      ac.abort();
    },
  };
}
