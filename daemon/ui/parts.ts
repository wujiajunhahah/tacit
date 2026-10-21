// Pieces several views share: headings, empty states, the copy row, the delete confirmation.

import type { Packet } from '../../core';
import { copyText, el, type Child } from './dom';
import { num, pct, t } from './i18n';

/** The view's title for screen readers and focus; the nav already shows it, so it is not drawn twice. */
export function heading(text: string): HTMLHeadingElement {
  const h = el('h1', 'sr-only', text);
  h.tabIndex = -1;
  return h;
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return el('section', 'section', el('h2', 'label', title), ...children);
}

export function emptyState(title: string, body: string): HTMLElement {
  return el('div', 'empty', el('p', 'empty-title', title), el('p', 'empty-body', body));
}

export function cost(packet: Packet): string {
  const tokens = num(packet.tokens);
  return packet.saved >= 0.02 ? t('now.cost', { tokens, pct: pct(packet.saved) }) : t('now.costPlain', { tokens });
}

/** A button that copies `text`, with what it costs beside it and a short confirmation after. */
export function copyRow(label: string, text: string, meta: string, done: string, primary = true): HTMLElement {
  const note = el('span', 'note');
  note.setAttribute('role', 'status');
  const button = el('button', primary ? 'btn' : 'quiet', label);
  button.type = 'button';
  let timer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener('click', async () => {
    note.textContent = (await copyText(text)) ? done : t('common.copyFailed');
    clearTimeout(timer);
    timer = setTimeout(() => (note.textContent = ''), 2600);
  });
  return el('div', 'handoff', button, meta && el('span', 'cost meta', meta), note);
}

/** Two steps for anything irreversible: the opener reveals the consequence, Cancel holds focus, Esc backs out. */
export function confirmFlow(opener: HTMLButtonElement, box: HTMLElement, text: string, confirmLabel: string, run: () => Promise<void>): void {
  box.hidden = true;
  opener.addEventListener('click', () => {
    const yes = el('button', 'danger solid', confirmLabel);
    const no = el('button', 'quiet', t('common.cancel'));
    yes.type = 'button';
    no.type = 'button';
    const close = () => {
      box.hidden = true;
      box.replaceChildren();
      opener.hidden = false;
      opener.focus();
    };
    no.addEventListener('click', close);
    box.onkeydown = (e) => {
      if (e.key === 'Escape') close();
    };
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      no.disabled = true;
      try {
        await run();
      } catch {
        box.replaceChildren(el('p', 'error', t('common.error')));
      }
    });
    box.replaceChildren(el('p', 'confirm-text', text), el('div', 'buttons', yes, no));
    box.hidden = false;
    opener.hidden = true;
    no.focus();
  });
}
