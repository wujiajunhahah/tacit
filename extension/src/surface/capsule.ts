// The Tacit line: one quiet line at the bottom of the page; on hover it grows into a slip of paper.
// It is the only surface: confirmations ("Jumped · Undo") show in the line itself, never in a second layer.

import { clip, tokenize, type Evidence, type Intent } from '../../../core';
import { HOST_TAG } from '../extract/dom';
import { ago, getLocale, hasCJK, t, tn, type Key } from '../i18n';
import type { HarnessStatus } from '../messages';
import type { Suggestion, View } from '../view';
import { arrive, pulse, stagger } from './motion';
import { CAPSULE_CSS } from './style';

export interface CapsuleModel {
  view: View;
  intent: Intent;
  feed: boolean;
  focus: boolean;
  canUndo: boolean;
  harness: HarnessStatus;
  /** Passages read closely on this visit. */
  reads: number;
  preview?: string;
}

export interface CapsuleHandlers {
  run(index: number): void;
  handoff(): void;
  toggleFocus(): void;
  pickIntent(text: string): void;
  undo(): void;
  pause(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (p: number) => `${Math.round(p * 100)}%`;
const USER_WORDS = new Set(['stated', 'search', 'selection', 'copy']);
const SOURCE: Partial<Record<Evidence['kind'], Key>> = {
  stated: 'src.stated',
  search: 'src.search',
  selection: 'src.selection',
  copy: 'src.copy',
  read: 'src.read',
  click: 'src.click',
  dwell: 'src.dwell',
  title: 'src.title',
};
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

/** Where a prediction came from, in three words. */
function source(ev: Evidence | undefined): string {
  const key = ev ? SOURCE[ev.kind] : undefined;
  return key ? t(key) : '';
}

/** Underline the words that matched what the user is after; works for languages without spaces. */
function markHits(text: string, terms: Record<string, number>): string {
  const parts = segmenter ? [...segmenter.segment(text)].map((s) => ({ s: s.segment, word: !!s.isWordLike })) : text.split(/(\s+)/).map((s) => ({ s, word: !!s.trim() }));
  return parts
    .map(({ s, word }) => (word && tokenize(s).some((tok) => (terms[tok] ?? 0) >= 0.5) ? `<u>${esc(s)}</u>` : esc(s)))
    .join('');
}

/** "Jump to “Install”" → verb "Jump to", object "Install", in the user's language. */
function split(s: Suggestion): { verb: string; obj: string; code: boolean } {
  const a = s.action;
  const quoted = a.label.match(/^(Jump to|Copy) “(.*)”$/);
  if (quoted) return { verb: t(quoted[1] === 'Copy' ? 'verb.copy' : 'verb.jump'), obj: quoted[2]!, code: a.kind === 'copy' };
  if (a.kind === 'jump') return { verb: '', obj: a.label, code: false };
  return { verb: t(a.kind === 'button' ? 'verb.press' : 'verb.open'), obj: a.label, code: false };
}

/** The user's own words: italic serif, except CJK, which gets an upright serif. */
function youHtml(text: string): string {
  return `<span class="you"${hasCJK(text) ? ' data-cjk' : ''}>${esc(text)}</span>`;
}

export class Capsule {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private model: CapsuleModel | null = null;
  private preview = false;
  private pinned = false;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  /** A confirmation the line shows for a few seconds instead of its suggestion. */
  private note: { text: string; action?: { label: string; run(): void } } | undefined;
  private noteTimer: ReturnType<typeof setTimeout> | undefined;
  /** What is on screen, so a render that changes nothing touches nothing, and one that does can say so. */
  private shown: { line?: string; slip?: string; step?: string } = {};

  constructor(private readonly handlers: CapsuleHandlers) {}

  mount(): void {
    if (this.host?.isConnected) return;
    this.host = document.createElement(HOST_TAG);
    this.root = this.host.attachShadow({ mode: 'open' });
    // A page may have removed the old line without destroy(): nothing of it is on screen any more.
    this.shown = {};
    this.root.innerHTML = `<style>${CAPSULE_CSS}</style><div class="tc" data-mode="quiet"><div class="slip" role="dialog" aria-label="Tacit"></div><div class="line" role="button" tabindex="0"><span class="glyph" aria-hidden="true"></span><span class="lc"></span></div><div class="sr" role="status" aria-live="polite"></div></div>`;
    document.documentElement.appendChild(this.host);
    const tc = this.tc()!;
    tc.addEventListener('click', (e) => this.onClick(e));
    tc.addEventListener('mouseenter', () => this.hover(true));
    tc.addEventListener('mouseleave', () => this.hover(false));
    requestAnimationFrame(() => tc.setAttribute('data-ready', ''));
  }

  destroy(): void {
    clearTimeout(this.hoverTimer);
    clearTimeout(this.noteTimer);
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.shown = {};
  }

  isOpen(): boolean {
    return this.tc()?.hasAttribute('data-open') ?? false;
  }

  open(on: boolean): void {
    if (!on) {
      this.pinned = false;
      this.preview = false;
    }
    const opening = on && !this.isOpen();
    this.tc()?.toggleAttribute('data-open', on);
    if (this.model) this.render(this.model);
    if (opening) stagger(this.root?.querySelectorAll('.sugs li, .choice, .slip pre, .tools') ?? []);
  }

  /** Keyboard hints appear only while ⌥ is held. */
  showKeys(on: boolean): void {
    this.tc()?.toggleAttribute('data-keys', on);
  }

  showPacket(): void {
    this.preview = true;
    this.pinned = true;
    this.open(true);
  }

  /** Says what just happened, in the line, for a few seconds; then the line goes back to what is next. */
  toast(text: string, action?: { label: string; run(): void }): void {
    this.note = { text, action };
    const live = this.root?.querySelector('.sr');
    if (live) live.textContent = text;
    this.tc()?.setAttribute('data-note', '');
    if (this.model) this.render(this.model);
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => this.clearNote(), action ? 4200 : 2600);
  }

  private clearNote(): void {
    clearTimeout(this.noteTimer);
    this.note = undefined;
    this.tc()?.removeAttribute('data-note');
    if (this.model) this.render(this.model);
  }

  render(model: CapsuleModel): void {
    this.model = model;
    const tc = this.tc();
    if (!tc) return;
    tc.setAttribute('data-mode', model.view.mode);
    tc.setAttribute('lang', getLocale());
    const line = this.root!.querySelector('.line')!;
    const html = this.lineHtml(model);
    if (html !== this.shown.line) {
      const content = line.querySelector('.lc')!;
      content.innerHTML = html;
      if (this.shown.line !== undefined) arrive(content.querySelector('.say'));
      this.shown.line = html;
      line.setAttribute('aria-label', line.textContent?.replace(/\s+/g, ' ').trim() || 'Tacit');
    }
    // A new next step, from the page or from a model: the glyph breathes once. A confirmation in between is not one.
    const v = model.view;
    if (!this.note) {
      const step = `${v.mode}|${v.suggestions[0]?.action.id ?? ''}`;
      if (this.shown.step !== undefined && step !== this.shown.step && (v.mode === 'act' || v.mode === 'suggest')) pulse(line.querySelector('.glyph'));
      this.shown.step = step;
    }
    const slip = this.slipHtml(model);
    if (slip !== this.shown.slip) {
      this.root!.querySelector('.slip')!.innerHTML = slip;
      this.shown.slip = slip;
    }
  }

  private tc(): HTMLElement | null {
    return this.root?.querySelector('.tc') ?? null;
  }

  private intentHtml(m: CapsuleModel): string {
    const text = clip(m.intent.text, 48);
    return USER_WORDS.has(m.intent.evidence[0]?.kind ?? '') ? youHtml(text) : `<span class="obj">${esc(text)}</span>`;
  }

  /** Where the guess came from, when, how sure, and how much you read: one line of provenance. */
  private provenance(m: CapsuleModel): string {
    const ev = m.intent.evidence[0];
    const bits = [source(ev), ev ? ago(Date.now() - ev.at) : '', m.intent.source === 'stated' ? '' : pct(m.intent.confidence)].filter(Boolean);
    if (m.reads) bits.push(tn('slip.reads.one', 'slip.reads.many', m.reads));
    return bits.join(' · ');
  }

  /** Everything in the line after the glyph, which stays, so its ink can change in place. */
  private lineHtml(m: CapsuleModel): string {
    if (this.note) {
      const a = this.note.action;
      return `<span class="say"><span class="obj">${esc(this.note.text)}</span></span>${a ? `<button class="act" data-act="note">${esc(a.label)}</button>` : ''}`;
    }
    const v = m.view;
    const asking = v.mode === 'ask' || v.mode === 'quiet';
    const prompt = `<span class="muted">${esc(t(v.askChoices.length ? 'line.ask' : 'slip.nothing'))}</span>`;
    // Open, the line is the slip's header: what Tacit knows. The steps are in the list above, once.
    if (this.isOpen()) return `<span class="say">${asking ? prompt : `${this.intentHtml(m)}<span class="src">· ${esc(this.provenance(m))}</span>`}</span>`;
    const src = source(m.intent.evidence[0]);
    const srcHtml = src ? `<span class="src">· ${esc(src)}</span>` : '';
    let say: string;
    if (asking) {
      say = prompt;
    } else if (m.feed) {
      const total = v.ranked.filter((r) => r.item.kind === 'item').length;
      const n = v.relevantPosts.length;
      say = `${this.intentHtml(m)}<span class="muted">· ${esc(n ? t('feed.count', { n, total }) : t('feed.none'))}</span>${srcHtml}`;
    } else if (v.suggestions[0]) {
      const { verb, obj, code } = split(v.suggestions[0]);
      say = `${verb ? `<span class="muted">${esc(verb)}</span>` : ''}<span class="${code ? 'code' : 'obj'}">${esc(obj)}</span>${srcHtml}`;
    } else {
      say = `${this.intentHtml(m)}<span class="muted">· ${esc(tn('passages.one', 'passages.many', v.highlights.length))}</span>${srcHtml}`;
    }
    const key = v.mode === 'act' || v.mode === 'suggest' ? '<kbd>⌥↵</kbd>' : '';
    return `<span class="say">${say}</span>${key}`;
  }

  private slipHtml(m: CapsuleModel): string {
    const v = m.view;
    const parts: string[] = [];
    const asking = v.mode === 'ask' || v.mode === 'quiet';

    if (!asking && v.suggestions.length) {
      const rows = v.suggestions.map((s, n) => {
        const { verb, obj, code } = split(s);
        const label = code ? `<span class="code">${esc(obj)}</span>` : markHits(obj, m.intent.terms);
        return `<li><button class="sug" data-act="run" data-i="${n}">${verb ? `<span class="v">${esc(verb)}</span>` : ''}<span class="l">${label}</span><kbd><span class="alt">⌥</span>${n + 1}</kbd></button></li>`;
      });
      parts.push(`<ul class="sugs">${rows.join('')}</ul>`);
    }

    if (asking && v.askChoices.length) {
      const choices = v.askChoices.map((c, n) => `<button class="choice" data-choice="${esc(c)}" title="${esc(c)}"><span class="l">${esc(c)}</span><kbd><span class="alt">⌥</span>${n + 1}</kbd></button>`).join('');
      parts.push(`<div class="choices">${choices}</div>`);
    }

    if (this.preview && m.preview) parts.push(`<pre>${esc(m.preview)}</pre>`);

    const tools = [
      `<button data-act="handoff">${esc(t('tool.handoff'))} <kbd>⌥⇧C</kbd></button>`,
      !m.feed && v.highlights.length ? `<button data-act="focus" aria-pressed="${m.focus}">${esc(t('tool.focus'))} <kbd>⌥⇧F</kbd></button>` : '',
      m.canUndo ? `<button data-act="undo">${esc(t('tool.undo'))} <kbd>⌥⇧Z</kbd></button>` : '',
      `<span class="gap"></span><button data-act="pause" title="${esc(t('tool.pause.title'))}">${esc(t('tool.pause'))}</button>`,
    ];
    parts.push(`<div class="tools">${tools.join('')}</div>`);
    return parts.join('');
  }

  private hover(entering: boolean): void {
    clearTimeout(this.hoverTimer);
    if (entering) this.hoverTimer = setTimeout(() => this.open(true), 120);
    else if (!this.pinned) this.hoverTimer = setTimeout(() => this.open(false), 320);
  }

  private onClick(e: Event): void {
    const target = e.target as Element;
    const choice = target.closest('[data-choice]');
    if (choice) {
      this.handlers.pickIntent(choice.getAttribute('data-choice') ?? '');
      return;
    }
    const act = target.closest('[data-act]');
    if (!act) {
      if (!target.closest('.line') || !this.model || this.note) return;
      const mode = this.model.view.mode;
      if ((mode === 'act' || mode === 'suggest') && this.model.view.suggestions.length) {
        this.handlers.run(0);
        this.open(false);
      } else {
        this.pinned = !this.pinned;
        this.open(this.pinned);
      }
      return;
    }
    const h = this.handlers;
    switch (act.getAttribute('data-act')) {
      case 'run':
        h.run(Number(act.getAttribute('data-i') ?? 0));
        this.open(false);
        break;
      case 'handoff':
        h.handoff();
        break;
      case 'focus':
        h.toggleFocus();
        break;
      case 'undo':
        h.undo();
        break;
      case 'pause':
        h.pause();
        break;
      case 'note': {
        const run = this.note?.action?.run;
        this.clearNote();
        run?.();
        break;
      }
    }
  }
}

