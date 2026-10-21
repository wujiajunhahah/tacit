// What the user does on the page: dwell, scroll depth, selections, copies, clicks.

import { clip, type Click, type Moment } from '../../core';
import { flat, isOwn, labelOf } from './extract/dom';
import { POST } from './extract/feed';

export interface TrackState {
  dwellMs: number;
  maxScroll: number;
  selections: Moment[];
  copies: Moment[];
  clicks: Click[];
}

export type TrackEvent = 'selection' | 'copy' | 'click' | 'dwell' | 'scroll';

export interface Tracker {
  state: TrackState;
  /** Ignore selections and copies for a while (our own clipboard writes). */
  suppress(ms: number): void;
  stop(): void;
}

function push<T>(list: T[], item: T, cap: number): void {
  list.push(item);
  if (list.length > cap) list.splice(0, list.length - cap);
}

const CLICKABLE = `a[href], button, [role="button"], [role="link"], ${POST}`;

/** "3h" or "12" says nothing about where a click leads; use the post or passage it belongs to. */
function meaningfulLabel(el: Element): string {
  const post = el.closest(POST);
  const postText = flat(post?.querySelector('[data-testid="tweetText"]')?.textContent);
  if (el === post) return postText ? clip(postText, 80) : labelOf(el);
  const label = labelOf(el);
  if (label.length > 4 && !/^\d+\s?[smhd]$/i.test(label)) return label;
  const text = postText || flat(el.closest('[data-tacit-id]')?.textContent);
  return text ? clip(text, 80) : label;
}

/** Where a click leads: the link itself, or the permalink of the post that was clicked. */
function hrefOf(el: Element): string | undefined {
  return (el as HTMLAnchorElement).href || el.closest(POST)?.querySelector<HTMLAnchorElement>('a[href*="status"]')?.href || undefined;
}

export function startTracker(onEvent: (e: TrackEvent, click?: Click) => void): Tracker {
  const state: TrackState = { dwellMs: 0, maxScroll: 0, selections: [], copies: [], clicks: [] };
  const ac = new AbortController();
  const opt: AddEventListenerOptions = { capture: true, passive: true, signal: ac.signal };
  let suppressUntil = 0;
  let lastSelection = '';
  let scrollQueued = false;

  const tick = setInterval(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    state.dwellMs += 1000;
    if (state.dwellMs % 5000 === 0) onEvent('dwell');
  }, 1000);

  const measureScroll = () => {
    scrollQueued = false;
    const height = Math.max(document.documentElement.scrollHeight, 1);
    const depth = Math.min(1, (window.scrollY + window.innerHeight) / height);
    if (depth > state.maxScroll + 0.02) {
      state.maxScroll = depth;
      onEvent('scroll');
    }
  };
  window.addEventListener(
    'scroll',
    () => {
      if (scrollQueued) return;
      scrollQueued = true;
      setTimeout(measureScroll, 250);
    },
    opt,
  );
  measureScroll();

  const readSelection = () => {
    if (Date.now() < suppressUntil) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || isOwn(sel.anchorNode)) return;
    const text = clip(sel.toString(), 2000);
    if (text.length < 3 || text === lastSelection) return;
    lastSelection = text;
    push(state.selections, { text, at: Date.now() }, 20);
    onEvent('selection');
  };
  document.addEventListener('mouseup', () => setTimeout(readSelection, 0), opt);
  document.addEventListener('keyup', (e) => e.shiftKey && readSelection(), opt);

  document.addEventListener(
    'copy',
    () => {
      if (Date.now() < suppressUntil) return;
      const text = clip(window.getSelection()?.toString() ?? '', 2000);
      if (text.length < 3) return;
      push(state.copies, { text, at: Date.now() }, 20);
      onEvent('copy');
    },
    opt,
  );

  document.addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted) return;
      const target = e.target as Element | null;
      // A click on a fold opens it; the posts inside were never seen, so they are not evidence.
      if (!target || isOwn(target) || target.closest?.('[data-tacit-folded]')) return;
      const el = target.closest?.(CLICKABLE);
      if (!el) return;
      const label = meaningfulLabel(el);
      if (!label) return;
      const click: Click = { label, href: hrefOf(el), at: Date.now() };
      push(state.clicks, click, 30);
      onEvent('click', click);
    },
    opt,
  );

  return {
    state,
    suppress(ms) {
      suppressUntil = Date.now() + ms;
    },
    stop() {
      ac.abort();
      clearInterval(tick);
    },
  };
}
