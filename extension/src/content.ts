// Content script: senses the page, asks the harness what the user is after, and reshapes the surface.

import { HARNESS_ORIGIN, HARNESS_PORT, buildPacket, clip, sameDocument, transition, type Click, type Intent, type LedgerEntry, type LedgerKind, type Visit } from '../../core';
import { copyText } from './clipboard';
import { extractPage, type Extracted } from './extract';
import { isOwn, normalizeUrl } from './extract/dom';
import { send, type DecideReply, type HarnessStatus, type IntentReply, type ToContent, type VisitStartReply } from './messages';
import { isActiveOn, loadSettings, onSettingsChanged, saveSettings, type Settings } from './settings';
import { Capsule } from './surface/capsule';
import { applyMarks, clearMarks, flash, foldedCount, installPageStyles, setFocus, unfoldAll, unfoldRun } from './surface/page';
import { startTracker, type TrackEvent, type Tracker } from './track';
import { buildDecision, computeView, refineView, type View } from './view';

interface Undo {
  label: string;
  entry: LedgerEntry;
  run(): void;
}

interface Session {
  visitId: string;
  extracted: Extracted;
  visit: Visit;
  intent: Intent;
  trailTail: Visit[];
  harness: HarnessStatus;
  view: View;
  tracker: Tracker;
  focus: boolean;
  unfolded: Set<string>;
  undo?: Undo;
  preview?: string;
  observer?: MutationObserver;
  foldEntry?: LedgerEntry;
}

let session: Session | null = null;
let capsule: Capsule | null = null;
let settings: Settings;
let starting = false;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let lastPageSync = 0;

const domain = () => location.hostname.replace(/^www\./, '');

void main();

async function main(): Promise<void> {
  if (window.top !== window || document.contentType !== 'text/html') return;
  if (location.origin === HARNESS_ORIGIN || location.host === `localhost:${HARNESS_PORT}`) return;
  settings = await loadSettings();
  onSettingsChanged((next) => {
    settings = next;
    if (!isActiveOn(domain(), next)) teardown();
    else if (!session) void start();
  });
  chrome.runtime.onMessage.addListener((msg: ToContent) => {
    if (msg.type === 'tacit:navigated') onNavigated(msg.url);
  });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', () => capsule?.showKeys(false));
  document.addEventListener('click', onFoldClick, true);
  window.addEventListener('pagehide', () => void pushUpdate(Date.now()), true);
  if (isActiveOn(domain(), settings)) await start();
}

async function start(): Promise<void> {
  if (starting || session) return;
  starting = true;
  try {
    installPageStyles();
    const extracted = extractPage(document, location);
    const visitId = crypto.randomUUID();
    const reply = await send<VisitStartReply>({
      type: 'visit:start',
      visitId,
      url: location.href,
      title: extracted.page.title,
      referrer: document.referrer,
      page: extracted.page,
      startedAt: Date.now(),
    });
    const visited = new Set(reply.visitedUrls.map(normalizeUrl));
    for (const a of extracted.page.actions) if (a.href && visited.has(normalizeUrl(a.href))) a.visited = true;
    const unfolded = new Set<string>();
    session = {
      visitId,
      extracted,
      visit: reply.visit,
      intent: reply.intent,
      trailTail: reply.trailTail,
      harness: reply.harness,
      view: computeView(extracted.page, reply.intent, extracted.feed, unfolded),
      tracker: startTracker(onTrack),
      focus: false,
      unfolded,
    };
    capsule ??= new Capsule(handlers);
    capsule.mount();
    render();
    if (reply.visit.arrival.kind === 'tacit') capsule.toast('Arrived from a Tacit suggestion', { label: 'Back', run: () => history.back() });
    void refine();
    if (extracted.feed) watchFeed();
    else if (extracted.page.textLength < 800) reextractLater(session, 1500);
  } catch (err) {
    console.debug('[tacit] could not start', err);
  } finally {
    starting = false;
  }
}

/** Single-page apps often render their text after we start; read the page again once it has some. */
function reextractLater(s: Session, delay: number, attempt = 0): void {
  setTimeout(() => {
    if (session !== s) return;
    const next = extractPage(document, location);
    if (next.page.textLength > s.extracted.page.textLength * 1.3 + 200) {
      s.extracted = next;
      recompute(s);
      void send({ type: 'page:update', visitId: s.visitId, page: next.page }).catch(() => undefined);
    } else if (attempt === 0) reextractLater(s, 3000, 1);
  }, delay);
}

function teardown(): void {
  void pushUpdate(Date.now());
  session?.tracker.stop();
  session?.observer?.disconnect();
  session = null;
  clearMarks();
  setFocus(false);
  capsule?.destroy();
  capsule = null;
}

function render(): void {
  const s = session;
  if (!s || !capsule) return;
  applyMarks(s.view, s.extracted.elements);
  syncFoldEntry(s);
  capsule.render({
    view: s.view,
    intent: s.intent,
    feed: s.extracted.feed,
    focus: s.focus,
    folded: foldedCount(),
    canUndo: !!s.undo,
    harness: s.harness,
    preview: s.preview,
  });
}

function recompute(s: Session): void {
  s.view = computeView(s.extracted.page, s.intent, s.extracted.feed, s.unfolded);
  render();
  void refine();
}

async function refine(): Promise<void> {
  const s = session;
  if (!s || !s.harness.connected || s.harness.engine !== 'jev') return;
  const decision = buildDecision(s.extracted.page, s.intent, s.view, s.extracted.feed);
  if (!decision) return;
  try {
    const { response } = await send<DecideReply>({ type: 'decide', request: decision.request });
    if (session !== s) return;
    s.view = refineView(s.view, s.intent, response, decision.keys, s.unfolded, s.extracted.page.actions);
    render();
  } catch (err) {
    console.debug('[tacit] decision engine unavailable, keeping local view', err);
  }
}

function onTrack(event: TrackEvent, click?: Click): void {
  if (event === 'click' && click) void send({ type: 'click', click }).catch(() => undefined);
  const urgent = event === 'selection' || event === 'copy';
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => void pushUpdate(), urgent ? 250 : 4000);
}

function intentChanged(a: Intent, b: Intent): boolean {
  return a.text !== b.text || a.source !== b.source || Math.abs(a.confidence - b.confidence) > 0.08;
}

async function pushUpdate(endedAt?: number): Promise<void> {
  const s = session;
  if (!s) return;
  const t = s.tracker.state;
  const reply = await send<IntentReply>({
    type: 'visit:update',
    visitId: s.visitId,
    patch: { title: document.title, dwellMs: t.dwellMs, maxScroll: t.maxScroll, selections: t.selections, copies: t.copies, clicks: t.clicks, endedAt },
  }).catch(() => null);
  if (!reply || session !== s || endedAt) return;
  if (reply.visit) s.visit = reply.visit;
  if (intentChanged(s.intent, reply.intent)) {
    s.intent = reply.intent;
    recompute(s);
  }
}

function newEntry(kind: LedgerKind, label: string, reason: string, undoable: boolean, confidence?: number): LedgerEntry {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    kind,
    label: clip(label, 120),
    state: 'suggested',
    url: location.href,
    reason,
    confidence,
    engine: session?.view.engine,
    undoable,
  };
}

function record(entry: LedgerEntry): void {
  void send({ type: 'ledger', entry }).catch(() => undefined);
}

function confirmAndExecute(entry: LedgerEntry): LedgerEntry {
  const done = transition(transition(entry, 'confirmed'), 'executed');
  record(done);
  return done;
}

function syncFoldEntry(s: Session): void {
  const n = foldedCount();
  if (n > 0 && !s.foldEntry) {
    s.foldEntry = newEntry('fold', `Folded ${n} posts`, `no overlap with “${clip(s.intent.text, 40)}”`, true, s.intent.confidence);
    record(s.foldEntry);
  }
}

/** Glide to nearby targets; far ones jump, so nobody waits through ten screens of scrolling. */
function scrollBehavior(toY: number): ScrollBehavior {
  return Math.abs(toY - window.scrollY) > window.innerHeight * 2.5 ? 'instant' : 'smooth';
}

function scrollToElement(el: Element): void {
  const r = el.getBoundingClientRect();
  const top = window.scrollY + r.top - (window.innerHeight - Math.min(r.height, window.innerHeight)) / 2;
  window.scrollTo({ top, behavior: scrollBehavior(top) });
}

function runSuggestion(index: number): void {
  const s = session;
  const sug = s?.view.suggestions[index];
  if (!s || !sug || !capsule) return;
  const a = sug.action;
  const reason = sug.reasons.join(', ') || 'predicted from your context';
  if (a.kind === 'jump' && a.targetBlockId) {
    const el = s.extracted.elements.get(a.targetBlockId);
    if (!el?.isConnected) return;
    const from = window.scrollY;
    scrollToElement(el);
    flash(el);
    const entry = confirmAndExecute(newEntry('jump', a.label, reason, true, sug.p));
    s.undo = { label: 'Back to where you were', entry, run: () => window.scrollTo({ top: from, behavior: scrollBehavior(from) }) };
    render();
    capsule.toast(a.label.replace(/^Jump to /, 'Jumped to '), { label: 'Undo', run: undo });
    return;
  }
  if (a.kind === 'copy' && a.payload) {
    void copyAction(s, a.payload, a.label, a.targetBlockId, reason, sug.p);
    return;
  }
  if (!a.href) return;
  confirmAndExecute(newEntry('navigate', a.label, reason, false, sug.p));
  void send({ type: 'click', click: { label: a.label, href: a.href, at: Date.now(), viaTacit: true } })
    .catch(() => undefined)
    .finally(() => {
      const el = s.extracted.elements.get(a.id) as HTMLElement | undefined;
      if (el?.isConnected) el.click();
      else location.assign(a.href!);
    });
}

async function copyAction(s: Session, payload: string, label: string, blockId: string | undefined, reason: string, p: number): Promise<void> {
  s.tracker.suppress(800);
  const copied = await copyText(payload);
  const el = blockId ? s.extracted.elements.get(blockId) : undefined;
  if (el?.isConnected) {
    scrollToElement(el);
    flash(el);
  }
  confirmAndExecute(newEntry('copy', label, reason, false, p));
  capsule?.toast(copied ? label.replace(/^Copy /, 'Copied ') : 'Clipboard blocked here');
}

function currentSelection(): string | undefined {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || isOwn(sel.anchorNode)) return undefined;
  const text = sel.toString().trim();
  return text.length >= 3 ? text : undefined;
}

async function handoff(): Promise<void> {
  const s = session;
  if (!s || !capsule) return;
  const packet = buildPacket({
    page: s.extracted.page,
    intent: s.intent,
    visit: { ...s.visit, selections: s.tracker.state.selections },
    trail: s.trailTail,
    ranked: s.view.ranked,
    selection: currentSelection(),
  });
  s.tracker.suppress(800);
  const copied = await copyText(packet.markdown);
  s.preview = packet.markdown;
  confirmAndExecute(newEntry('handoff', 'Handed this page to your agent', `~${packet.tokens} tokens instead of ~${packet.fullPageTokens}`, false));
  render();
  const saved = Math.round(packet.saved * 100);
  capsule.toast(
    copied ? `Copied for your agent · ${packet.tokens} tokens instead of ${packet.fullPageTokens}${saved > 0 ? ` (−${saved}%)` : ''}` : 'Clipboard blocked here · open the packet',
    { label: 'Show packet', run: () => capsule?.showPacket() },
  );
}

function toggleFocus(): void {
  const s = session;
  if (!s || !capsule || s.extracted.feed) return;
  s.focus = !s.focus;
  setFocus(s.focus);
  if (s.focus) {
    const entry = confirmAndExecute(newEntry('focus', `Focus on “${clip(s.intent.text, 40)}”`, 'dimmed what does not match', true, s.intent.confidence));
    s.undo = { label: 'Leave focus', entry, run: () => toggleFocus() };
  } else if (s.undo?.entry.kind === 'focus') {
    record(transition(s.undo.entry, 'undone'));
    s.undo = undefined;
  }
  render();
  capsule.toast(s.focus ? `Focused on “${clip(s.intent.text, 40)}”` : 'Focus off');
}

function undo(): void {
  const s = session;
  if (!s?.undo) return;
  if (s.undo.entry.kind === 'focus') {
    toggleFocus();
    return;
  }
  const u = s.undo;
  s.undo = undefined;
  u.run();
  record(transition(u.entry, 'undone'));
  render();
  capsule?.toast('Undone');
}

async function pickIntent(text: string): Promise<void> {
  const s = session;
  if (!s || !text) return;
  const reply = await send<IntentReply>({ type: 'intent:state', visitId: s.visitId, text }).catch(() => null);
  if (!reply || session !== s) return;
  confirmAndExecute(newEntry('intent', `You’re after “${clip(text, 60)}”`, 'you picked it', false, 1));
  s.intent = reply.intent;
  if (reply.visit) s.visit = reply.visit;
  recompute(s);
  capsule?.open(false);
}

function showFolded(ids: string[]): void {
  const s = session;
  if (!s || !ids.length) return;
  ids.forEach((id) => s.unfolded.add(id));
  const foldRuns = s.view.foldRuns.map((run) => run.filter((id) => !s.unfolded.has(id))).filter((run) => run.length > 0);
  s.view = { ...s.view, foldRuns };
  if (s.foldEntry?.state === 'suggested' && foldRuns.length === 0) {
    s.foldEntry = transition(s.foldEntry, 'dismissed');
    record(s.foldEntry);
  }
  render();
}

function pauseSite(): void {
  const d = domain();
  if (!settings.pausedDomains.includes(d)) void saveSettings({ ...settings, pausedDomains: [...settings.pausedDomains, d] });
}

const handlers = {
  run: runSuggestion,
  handoff: () => void handoff(),
  toggleFocus,
  pickIntent: (text: string) => void pickIntent(text),
  unfoldAll: () => showFolded(unfoldAll()),
  undo,
  pause: pauseSite,
};

function onFoldClick(e: MouseEvent): void {
  const el = (e.target as Element | null)?.closest?.('[data-tacit-folded]');
  if (!el || !session) return;
  e.preventDefault();
  e.stopPropagation();
  showFolded(unfoldRun(el.getAttribute('data-tacit-run') ?? ''));
}

function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key === 'Alt') capsule?.showKeys(false);
}

function onKey(e: KeyboardEvent): void {
  if (!session || !capsule || isEditable(e.target)) return;
  if (e.key === 'Alt') {
    capsule.showKeys(true);
    return;
  }
  if (e.key === 'Escape' && capsule.isOpen()) {
    capsule.open(false);
    return;
  }
  if (!e.altKey || e.metaKey || e.ctrlKey) return;
  let handled = true;
  if (e.code === 'Enter' && !e.shiftKey) runSuggestion(0);
  else if (/^Digit[1-3]$/.test(e.code) && !e.shiftKey) runSuggestion(Number(e.code.slice(5)) - 1);
  else if (e.code === 'KeyC' && e.shiftKey) void handoff();
  else if (e.code === 'KeyF' && e.shiftKey) toggleFocus();
  else if (e.code === 'KeyZ' && e.shiftKey) undo();
  else handled = false;
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function onNavigated(url: string): void {
  const s = session;
  if (!s || sameDocument(url, s.visit.url)) return;
  void pushUpdate(Date.now());
  s.tracker.stop();
  s.observer?.disconnect();
  session = null;
  clearMarks();
  setFocus(false);
  setTimeout(() => void start(), 700);
}

function watchFeed(): void {
  const s = session;
  if (!s) return;
  // X labels timelines "Timeline: …"; the tab strip above them is "Timelines", which must not match.
  const target = document.querySelector('[aria-label^="Timeline:"]') ?? document.querySelector('main, [role="main"]') ?? document.body;
  let timer: ReturnType<typeof setTimeout> | undefined;
  s.observer = new MutationObserver((records) => {
    if (records.every((r) => [...r.addedNodes].every((n) => isOwn(n) || !(n instanceof Element)))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (session !== s) return;
      const before = s.extracted.page.blocks.length;
      s.extracted = extractPage(document, location);
      if (s.extracted.page.blocks.length === before) return;
      recompute(s);
      if (Date.now() - lastPageSync > 5000) {
        lastPageSync = Date.now();
        void send({ type: 'page:update', visitId: s.visitId, page: s.extracted.page }).catch(() => undefined);
      }
    }, 700);
  });
  s.observer.observe(target, { childList: true, subtree: true });
}
