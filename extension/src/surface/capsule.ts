// The Tacit line: one quiet line at the bottom of the page; on hover it grows into a slip of paper.

import { ago, clip, tokenize, type Evidence, type Intent } from '../../../core';
import { HOST_TAG } from '../extract/dom';
import type { HarnessStatus } from '../messages';
import type { Suggestion, View } from '../view';
import { CAPSULE_CSS } from './style';

export interface CapsuleModel {
  view: View;
  intent: Intent;
  feed: boolean;
  focus: boolean;
  folded: number;
  canUndo: boolean;
  harness: HarnessStatus;
  preview?: string;
}

export interface CapsuleHandlers {
  run(index: number): void;
  handoff(): void;
  toggleFocus(): void;
  pickIntent(text: string): void;
  unfoldAll(): void;
  undo(): void;
  pause(): void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (p: number) => `${Math.round(p * 100)}%`;
const USER_WORDS = new Set(['stated', 'search', 'selection', 'copy']);

/** Where a prediction came from, in three words. */
function source(ev: Evidence | undefined): string {
  switch (ev?.kind) {
    case 'stated':
      return 'you said';
    case 'search':
      return 'from your search';
    case 'selection':
      return 'from your selection';
    case 'copy':
      return 'from what you copied';
    case 'click':
      return 'from your click';
    case 'dwell':
      return 'from your reading';
    case 'title':
      return 'from this page';
    default:
      return '';
  }
}

/** Underline the words that matched what the user is after. */
function markHits(text: string, terms: Record<string, number>): string {
  return text
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;
      const hit = tokenize(part).some((t) => (terms[t] ?? 0) >= 0.5);
      return hit ? `<u>${esc(part)}</u>` : esc(part);
    })
    .join('');
}

/** "Jump to “Install”" → verb "Jump to", object "Install". */
function split(s: Suggestion): { verb: string; obj: string; code: boolean } {
  const a = s.action;
  const quoted = a.label.match(/^(Jump to|Copy) “(.*)”$/);
  if (quoted) return { verb: quoted[1]!, obj: quoted[2]!, code: a.kind === 'copy' };
  if (a.kind === 'jump') return { verb: '', obj: a.label, code: false };
  return { verb: a.kind === 'button' ? 'Press' : 'Open', obj: a.label, code: false };
}

export class Capsule {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private model: CapsuleModel | null = null;
  private preview = false;
  private pinned = false;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private toastAction: (() => void) | undefined;

  constructor(private readonly handlers: CapsuleHandlers) {}

  mount(): void {
    if (this.host?.isConnected) return;
    this.host = document.createElement(HOST_TAG);
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${CAPSULE_CSS}</style><div class="tc" data-mode="quiet"><div class="slip" role="dialog" aria-label="Tacit"></div><div class="line" role="button" tabindex="0"></div><div class="toast" role="status" aria-live="polite"></div></div>`;
    document.documentElement.appendChild(this.host);
    const tc = this.tc()!;
    tc.addEventListener('click', (e) => this.onClick(e));
    tc.addEventListener('mouseenter', () => this.hover(true));
    tc.addEventListener('mouseleave', () => this.hover(false));
    requestAnimationFrame(() => tc.setAttribute('data-ready', ''));
  }

  destroy(): void {
    clearTimeout(this.hoverTimer);
    clearTimeout(this.toastTimer);
    this.host?.remove();
    this.host = null;
    this.root = null;
  }

  isOpen(): boolean {
    return this.tc()?.hasAttribute('data-open') ?? false;
  }

  open(on: boolean): void {
    if (!on) {
      this.pinned = false;
      this.preview = false;
    }
    this.tc()?.toggleAttribute('data-open', on);
    if (this.model) this.render(this.model);
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

  toast(text: string, action?: { label: string; run(): void }): void {
    const t = this.root?.querySelector('.toast');
    if (!t) return;
    this.toastAction = action?.run;
    t.innerHTML = `<span>${esc(text)}</span>${action ? `<button data-act="toast">${esc(action.label)}</button>` : ''}`;
    this.tc()?.setAttribute('data-toast', '');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.tc()?.removeAttribute('data-toast'), action ? 4200 : 2600);
  }

  render(model: CapsuleModel): void {
    this.model = model;
    const tc = this.tc();
    if (!tc) return;
    tc.setAttribute('data-mode', model.view.mode);
    const line = this.root!.querySelector('.line')!;
    line.innerHTML = this.lineHtml(model);
    line.setAttribute('aria-label', line.textContent?.replace(/\s+/g, ' ').trim() || 'Tacit');
    this.root!.querySelector('.slip')!.innerHTML = this.slipHtml(model);
  }

  private tc(): HTMLElement | null {
    return this.root?.querySelector('.tc') ?? null;
  }

  private intentHtml(m: CapsuleModel, size: 'line' | 'slip'): string {
    const userWords = USER_WORDS.has(m.intent.evidence[0]?.kind ?? '');
    const text = esc(clip(m.intent.text, size === 'line' ? 48 : 80));
    return userWords ? `<span class="you">${text}</span>` : `<span class="obj">${text}</span>`;
  }

  private lineHtml(m: CapsuleModel): string {
    const v = m.view;
    const src = source(m.intent.evidence[0]);
    const srcHtml = src ? `<span class="src">· ${esc(src)}</span>` : '';
    let say: string;
    if (v.mode === 'ask' || v.mode === 'quiet') {
      say = `<span class="muted">${v.askChoices.length ? 'What are you here for?' : 'Hand this page to your agent'}</span>`;
    } else if (m.feed) {
      const total = v.ranked.filter((r) => r.item.kind === 'item').length;
      const n = v.relevantPosts.length;
      say = `${this.intentHtml(m, 'line')}<span class="muted">· ${n ? `${n} of ${total}` : 'nothing here'}</span>${srcHtml}`;
    } else if (v.suggestions[0]) {
      const { verb, obj, code } = split(v.suggestions[0]);
      say = `${verb ? `<span class="muted">${esc(verb)}</span>` : ''}<span class="${code ? 'code' : 'obj'}">${esc(obj)}</span>${srcHtml}`;
    } else {
      say = `${this.intentHtml(m, 'line')}<span class="muted">· ${v.highlights.length} ${v.highlights.length === 1 ? 'passage' : 'passages'}</span>${srcHtml}`;
    }
    const key = v.mode === 'act' || v.mode === 'suggest' ? '<kbd>⌥↵</kbd>' : '';
    return `<span class="glyph" aria-hidden="true"></span><span class="say">${say}</span>${key}`;
  }

  private slipHtml(m: CapsuleModel): string {
    const v = m.view;
    const i = m.intent;
    const parts: string[] = [];
    const asking = v.mode === 'ask' || v.mode === 'quiet';

    if (!asking) {
      parts.push(`<p class="intent">${this.intentHtml(m, 'slip')}</p>`);
      const ev = i.evidence[0];
      const bits = [source(ev), ev ? ago(Date.now() - ev.at) : '', i.source === 'stated' ? '' : pct(i.confidence)].filter(Boolean);
      parts.push(`<p class="prov">${esc(bits.join(' · '))}</p>`);
    }

    if (!asking && v.suggestions.length) {
      const rows = v.suggestions.map((s, n) => {
        const { verb, obj, code } = split(s);
        const label = code ? `<span class="code">${esc(obj)}</span>` : markHits(obj, i.terms);
        return `<li><button class="sug" data-act="run" data-i="${n}">${verb ? `<span class="v">${esc(verb)}</span>` : ''}<span class="l">${label}</span><kbd>⌥${n + 1}</kbd></button></li>`;
      });
      parts.push(`<ul class="sugs">${rows.join('')}</ul>`);
    }

    if (asking) {
      if (v.askChoices.length) {
        const choices = v.askChoices.map((c) => `<button class="choice" data-choice="${esc(c)}" title="${esc(c)}">${esc(c)}</button>`).join('');
        parts.push(`<div class="choices">${choices}</div>`);
      } else {
        parts.push(`<p class="note">Select or search something and Tacit will follow.</p>`);
      }
    }

    if (this.preview && m.preview) parts.push(`<pre>${esc(m.preview)}</pre>`);

    const tools = [
      `<button data-act="handoff">Hand to agent <kbd>⌥⇧C</kbd></button>`,
      !m.feed && v.highlights.length ? `<button data-act="focus" aria-pressed="${m.focus}">Focus <kbd>⌥⇧F</kbd></button>` : '',
      m.canUndo ? `<button data-act="undo">Undo <kbd>⌥⇧Z</kbd></button>` : '',
      `<span class="gap"></span><button data-act="pause" title="Stop reading this site">Pause</button>`,
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
      if (!target.closest('.line') || !this.model) return;
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
      case 'toast':
        this.toastAction?.();
        this.tc()?.removeAttribute('data-toast');
        break;
    }
  }
}
