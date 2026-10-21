// Content script: senses the page, asks the harness what the user is after, and reshapes the surface.

import {
  HARNESS_ORIGIN,
  HARNESS_PORT,
  buildPacket,
  clip,
  combinedConfidence,
  foldsAllowed,
  sameDocument,
  transition,
  type Calibration,
  type Click,
  type Intent,
  type LedgerEntry,
  type LedgerKind,
  type Visit,
} from '../../core';
import { startAttention, type Attention } from './attention';
import { copyText } from './clipboard';
import { POST, extractPage, newFeedMemory, type Extracted, type FeedMemory } from './extract';
import { isOwn, normalizeUrl } from './extract/dom';
import { detectLocale, quote, setLocale, t } from './i18n';
import { send, type DecideReply, type HarnessStatus, type IntentReply, type ToContent, type VisitStartReply } from './messages';
import { isActiveAt, loadSettings, onSettingsChanged, saveSettings, type Settings } from './settings';
import { Capsule } from './surface/capsule';
import { applyMarks, clearMarks, flash, installPageStyles, setFocus } from './surface/page';
import { startTracker, type TrackEvent, type Tracker } from './track';
import { buildDecision, computeView, refineView, type View, type ViewOptions } from './view';

interface Undo {
  entry: LedgerEntry;
  run(): void;
  /** The suggestion it ran, offered again once undone. */
  actionId?: string;
}

interface Session {
  visitId: string;
  extracted: Extracted;
  memory: FeedMemory;
  visit: Visit;
  intent: Intent;
  trailTail: Visit[];
  harness: HarnessStatus;
  calibration: Calibration;
  view: View;
  tracker: Tracker;
  attention: Attention;
  focus: boolean;
  unfolded: Set<string>;
  undo?: Undo;
  preview?: string;
  observer?: MutationObserver;
  foldEntry?: LedgerEntry;
  /** Passages read closely, as last shown in the slip. */
  shownReads: number;
  /** Suggestions already run on this visit: offering them again would be noise. */
  done: Set<string>;
}

let session: Session | null = null;
let capsule: Capsule | null = null;
let settings: Settings;
let starting = false;
let updateTimer: ReturnType<typeof setTimeout> | undefined;
let lastPageSync = 0;

const domain = () => location.hostname.replace(/^www\./, '');
const activeHere = () => isActiveAt(location.hostname, location.pathname, settings);
const attentionConfig = () => ({ pointer: settings.readWithPointer, pointerDwellMs: settings.pointerDwellMs });

/** The web runtime starts the page script itself, once the document is ready. */
export const startContent = (): Promise<void> => main();
if (!('__TACIT_WEB__' in globalThis)) void main();

async function main(): Promise<void> {
  if (window.top !== window || document.contentType !== 'text/html') return;
  // A page running Tacit as a page script (the demo's /try) already has its line.
  if (!('__TACIT_WEB__' in globalThis) && document.documentElement.dataset.tacit === 'web') return;
  if (location.origin === HARNESS_ORIGIN || location.host === `localhost:${HARNESS_PORT}`) return;
  settings = await loadSettings();
  setLocale(detectLocale(settings.locale));
  onSettingsChanged((next) => {
    settings = next;
    setLocale(detectLocale(next.locale));
    if (!activeHere()) teardown();
    else if (!session) void start();
    else {
      session.attention.configure(attentionConfig());
      render();
    }
  });
  chrome.runtime.onMessage.addListener((msg: ToContent) => {
    if (msg.type === 'tacit:navigated') onNavigated(msg.url);
  });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', () => capsule?.showKeys(false));
  document.addEventListener('click', onFoldClick, true);
  window.addEventListener('pagehide', () => void pushUpdate(Date.now()), true);
  if (activeHere()) await start();
}

function viewOptions(s: Pick<Session, 'calibration'>): ViewOptions {
  return { thresholds: s.calibration.thresholds, folds: foldsAllowed(s.calibration, location.href) };
}

async function start(): Promise<void> {
  if (starting || session || !activeHere()) return;
  starting = true;
  try {
    installPageStyles();
    const memory = newFeedMemory();
    const extracted = extractPage(document, location, memory);
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
    const attention = startAttention(attentionConfig(), onRead);
    attention.observe(extracted.elements, extracted.page.blocks);
    const s: Session = {
      visitId,
      extracted,
      memory,
      visit: reply.visit,
      intent: reply.intent,
      trailTail: reply.trailTail,
      harness: reply.harness,
      calibration: reply.calibration,
      view: computeView(extracted.page, reply.intent, extracted.feed, unfolded, viewOptions(reply)),
      tracker: startTracker(onTrack),
      attention,
      focus: false,
      unfolded,
      shownReads: 0,
      done: new Set(),
    };
    session = s;
    capsule ??= new Capsule(handlers);
    capsule.mount();
    render();
    if (reply.visit.arrival.kind === 'tacit') capsule.toast(t('toast.arrived'), { label: t('toast.back'), run: () => history.back() });
    void refine();
    if (extracted.feed) watchFeed();
    else if (extracted.page.textLength < 800) reextractLater(s, 1500);
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
    const next = extractPage(document, location, s.memory);
    if (next.page.textLength > s.extracted.page.textLength * 1.3 + 200) {
      s.extracted = next;
      s.attention.observe(next.elements, next.page.blocks);
      recompute(s);
      void send({ type: 'page:update', visitId: s.visitId, page: next.page }).catch(() => undefined);
    } else if (attempt === 0) reextractLater(s, 3000, 1);
  }, delay);
}

function stopSession(): void {
  const s = session;
  if (!s) return;
  void pushUpdate(Date.now());
  s.tracker.stop();
  s.attention.stop();
  s.observer?.disconnect();
  session = null;
  clearMarks();
  setFocus(false);
}

function teardown(): void {
  stopSession();
  capsule?.destroy();
  capsule = null;
}

/** The view as the user sees it: what was just run is done, and the next step is only a suggestion. */
function shownView(s: Session): View {
  const suggestions = s.view.suggestions.filter((x) => !s.done.has(x.action.id));
  if (suggestions.length === s.view.suggestions.length) return s.view;
  const marked = s.view.highlights.length > 0 || s.view.relevantPosts.length > 0;
  return { ...s.view, suggestions, mode: suggestions.length || marked ? 'suggest' : 'quiet' };
}

function render(): void {
  const s = session;
  if (!s || !capsule) return;
  applyMarks(s.view, s.extracted.elements);
  syncFoldEntry(s);
  capsule.render({
    view: shownView(s),
    intent: s.intent,
    feed: s.extracted.feed,
    focus: s.focus,
    canUndo: !!s.undo,
    harness: s.harness,
    reads: (s.shownReads = s.attention.reads().length),
    preview: s.preview,
  });
}

function recompute(s: Session, refineNow = true): void {
  s.view = computeView(s.extracted.page, s.intent, s.extracted.feed, s.unfolded, viewOptions(s));
  render();
  if (refineNow) void refine();
}

async function refine(): Promise<void> {
  const s = session;
  if (!s || !s.harness.connected || s.harness.engine !== 'jev') return;
  const decision = buildDecision(s.extracted.page, s.intent, s.view, s.extracted.feed);
  if (!decision) return;
  try {
    const { response } = await send<DecideReply>({ type: 'decide', request: decision.request });
    if (session !== s) return;
    s.view = refineView(s.view, s.intent, response, decision.keys, s.unfolded, s.extracted.page.actions, { ...viewOptions(s), page: s.extracted.page });
    render();
  } catch (err) {
    console.debug('[tacit] decision engine unavailable, keeping local view', err);
  }
}

function scheduleUpdate(delay: number): void {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => void pushUpdate(), delay);
}

/** Reading is context: the harness gets the passages, and the slip shows how many. */
function onRead(): void {
  scheduleUpdate(4000);
  const s = session;
  if (s && s.attention.reads().length !== s.shownReads) render();
}

function onTrack(event: TrackEvent, click?: Click): void {
  if (event === 'click' && click) void send({ type: 'click', click }).catch(() => undefined);
  scheduleUpdate(event === 'selection' || event === 'copy' ? 250 : 4000);
}

function intentChanged(a: Intent, b: Intent): boolean {
  return a.text !== b.text || a.source !== b.source || Math.abs(a.confidence - b.confidence) > 0.08;
}

async function pushUpdate(endedAt?: number): Promise<void> {
  const s = session;
  if (!s) return;
  const tr = s.tracker.state;
  const reply = await send<IntentReply>({
    type: 'visit:update',
    visitId: s.visitId,
    patch: {
      title: document.title,
      dwellMs: tr.dwellMs,
      maxScroll: tr.maxScroll,
      selections: tr.selections,
      copies: tr.copies,
      clicks: tr.clicks,
      reads: s.attention.reads(),
      endedAt,
    },
  }).catch(() => null);
  if (!reply || session !== s || endedAt) return;
  if (reply.visit) s.visit = reply.visit;
  if (intentChanged(s.intent, reply.intent)) {
    s.intent = reply.intent;
    recompute(s);
  } else render();
}

function newEntry(kind: LedgerKind, label: string, reason: string, undoable: boolean, confidence?: number): LedgerEntry {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    at: now,
    createdAt: now,
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
  const n = s.view.foldRuns.reduce((k, run) => k + run.length, 0);
  if (n > 0 && !s.foldEntry) {
    s.foldEntry = newEntry('fold', `Folded ${n} posts`, `no overlap with “${clip(s.intent.text, 40)}”`, true, s.intent.confidence);
    record(s.foldEntry);
  }
}

/** Glide to nearby targets; far ones jump, so nobody waits through ten screens of scrolling. */
function scrollBehavior(toY: number): ScrollBehavior {
  return Math.abs(toY - window.scrollY) > window.innerHeight * 2.5 ? 'instant' : 'smooth';
}

/** Like an anchor link, with room above: the target near the top, what follows it in the reading band. */
function scrollToElement(el: Element): void {
  const top = window.scrollY + el.getBoundingClientRect().top - window.innerHeight * 0.2;
  window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior(top) });
}

function runSuggestion(index: number): void {
  const s = session;
  const sug = s ? shownView(s).suggestions[index] : undefined;
  if (!s || !sug || !capsule) return;
  const a = sug.action;
  const reason = sug.reasons.join(', ') || 'predicted from your context';
  // The ledger keeps the confidence the line acted on, so calibration can learn from it.
  const confidence = combinedConfidence(s.intent.confidence, sug.p);
  if (a.kind === 'jump' && a.targetBlockId) {
    const el = s.extracted.elements.get(a.targetBlockId);
    if (!el?.isConnected) return;
    const from = window.scrollY;
    scrollToElement(el);
    flash(el);
    const entry = confirmAndExecute(newEntry('jump', a.label, reason, true, confidence));
    s.undo = { entry, actionId: a.id, run: () => window.scrollTo({ top: from, behavior: scrollBehavior(from) }) };
    s.done.add(a.id);
    render();
    const target = a.label.match(/^Jump to “(.*)”$/)?.[1] ?? clip(a.label, 48);
    capsule.toast(t('toast.jumped', { x: quote(target) }), { label: t('toast.undo'), run: undo });
    return;
  }
  if (a.kind === 'copy' && a.payload) {
    s.done.add(a.id);
    void copyAction(s, a.payload, a.label, a.targetBlockId, reason, confidence);
    return;
  }
  if (!a.href) return;
  confirmAndExecute(newEntry('navigate', a.label, reason, false, confidence));
  void send({ type: 'click', click: { label: a.label, href: a.href, at: Date.now(), viaTacit: true } })
    .catch(() => undefined)
    .finally(() => {
      const el = s.extracted.elements.get(a.id) as HTMLElement | undefined;
      if (el?.isConnected) el.click();
      else location.assign(a.href!);
    });
}

async function copyAction(s: Session, payload: string, label: string, blockId: string | undefined, reason: string, confidence: number): Promise<void> {
  s.tracker.suppress(800);
  const copied = await copyText(payload);
  const el = blockId ? s.extracted.elements.get(blockId) : undefined;
  if (el?.isConnected) {
    scrollToElement(el);
    flash(el);
  }
  confirmAndExecute(newEntry('copy', label, reason, false, confidence));
  const what = label.match(/^Copy “(.*)”$/)?.[1] ?? clip(payload, 40);
  capsule?.toast(copied ? t('toast.copied', { x: quote(what) }) : t('toast.blocked'));
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
    visit: { ...s.visit, selections: s.tracker.state.selections, reads: s.attention.reads() },
    trail: s.trailTail,
    ranked: s.view.ranked,
    selection: currentSelection(),
  });
  s.tracker.suppress(800);
  const copied = await copyText(packet.markdown);
  s.preview = packet.markdown;
  confirmAndExecute(newEntry('handoff', 'Handed this page to your agent', `~${packet.tokens} tokens instead of ~${packet.fullPageTokens}`, false));
  render();
  const pct = Math.round(packet.saved * 100);
  const text = copied
    ? t('toast.handoff', { tokens: packet.tokens, full: packet.fullPageTokens }) + (pct > 0 ? t('toast.saved', { pct }) : '')
    : t('toast.handoffBlocked');
  capsule.toast(text, { label: t('toast.showPacket'), run: () => capsule?.showPacket() });
}

function toggleFocus(): void {
  const s = session;
  if (!s || !capsule || s.extracted.feed) return;
  s.focus = !s.focus;
  setFocus(s.focus);
  if (s.focus) {
    const entry = confirmAndExecute(newEntry('focus', `Focus on “${clip(s.intent.text, 40)}”`, 'dimmed what does not match', true, s.intent.confidence));
    s.undo = { entry, run: () => toggleFocus() };
  } else if (s.undo?.entry.kind === 'focus') {
    record(transition(s.undo.entry, 'undone'));
    s.undo = undefined;
  }
  render();
  capsule.toast(s.focus ? t('toast.focusOn', { x: quote(clip(s.intent.text, 40)) }) : t('toast.focusOff'));
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
  if (u.actionId) s.done.delete(u.actionId);
  record(transition(u.entry, 'undone'));
  render();
  capsule?.toast(t('toast.undone'));
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
  // A choice that names a section of this page is a place to go: one pick, not a pick and a key.
  const name = text.replace(/…$/, '').toLowerCase();
  const here = shownView(s).suggestions.findIndex((x) => x.action.kind === 'jump' && (x.action.label.match(/^Jump to “(.*)”$/)?.[1] ?? '').toLowerCase().startsWith(name));
  if (here >= 0) runSuggestion(here);
}

function showFolded(ids: string[]): void {
  const s = session;
  if (!s || !ids.length) return;
  ids.forEach((id) => s.unfolded.add(id));
  const foldRuns = s.view.foldRuns.map((run) => run.filter((id) => !s.unfolded.has(id))).filter((run) => run.length > 0);
  s.view = { ...s.view, foldRuns };
  // Opening any fold overrides it: that click is input Tacit cost you, and calibration should hear it.
  if (s.foldEntry?.state === 'suggested') {
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
  undo,
  pause: pauseSite,
};

function onFoldClick(e: MouseEvent): void {
  const el = (e.target as Element | null)?.closest?.('[data-tacit-folded]');
  if (!el || !session) return;
  // A fold is Tacit's own control: neither the page nor the click tracker should see this click.
  e.preventDefault();
  e.stopImmediatePropagation();
  // A virtual list keeps only part of a run in the DOM; unfold the whole run, as the view knows it.
  showFolded(session.view.foldRuns[Number(el.getAttribute('data-tacit-run'))] ?? []);
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** ⌥1–3: a suggestion, or, when Tacit is asking, a choice. */
function pick(n: number): void {
  const v = session && shownView(session);
  if (!v) return;
  if (v.mode === 'ask' || v.mode === 'quiet') {
    const choice = v.askChoices[n];
    if (choice) void pickIntent(choice);
  } else runSuggestion(n);
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
  else if (/^Digit[1-3]$/.test(e.code) && !e.shiftKey) pick(Number(e.code.slice(5)) - 1);
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
  if (s && sameDocument(url, s.visit.url)) return;
  stopSession();
  // A single-page app can move into a private area (X's messages); stop reading there.
  setTimeout(() => {
    if (activeHere()) void start();
    else teardown();
  }, 700);
}

/**
 * Feeds grow and recycle. A post the page re-renders gets its marks back at once, before the next paint,
 * so nothing flashes unfolded; new posts are remembered and ranked on a short throttle while the user
 * scrolls, so they are folded before they reach the screen. Only the decision engine waits for the feed to settle.
 */
function watchFeed(): void {
  const s = session;
  if (!s) return;
  // X labels timelines "Timeline: …"; the tab strip above them is "Timelines", which must not match.
  const target = document.querySelector('[aria-label^="Timeline:"]') ?? document.querySelector('main, [role="main"]') ?? document.body;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  let known = s.extracted.page.blocks.length;
  let onScreen = [...s.extracted.elements.keys()].join(',');
  const reread = () => {
    timer = undefined;
    if (session !== s) return;
    const now = [...s.extracted.elements.keys()].join(',');
    if (now !== onScreen) {
      onScreen = now;
      s.attention.observe(s.extracted.elements, s.extracted.page.blocks);
    }
    if (s.extracted.page.blocks.length === known) return;
    known = s.extracted.page.blocks.length;
    recompute(s, false);
    clearTimeout(settle);
    settle = setTimeout(() => session === s && void refine(), 800);
    if (Date.now() - lastPageSync > 5000) {
      lastPageSync = Date.now();
      void send({ type: 'page:update', visitId: s.visitId, page: s.extracted.page }).catch(() => undefined);
    }
  };
  // Only new or re-rendered posts matter; like counts and timestamps change all the time.
  const addsPost = (n: Node) => n instanceof Element && !isOwn(n) && (n.matches(POST) || n.querySelector(POST) !== null);
  s.observer = new MutationObserver((records) => {
    if (session !== s || !records.some((r) => [...r.addedNodes].some(addsPost))) return;
    s.extracted = extractPage(document, location, s.memory);
    applyMarks(s.view, s.extracted.elements);
    timer ??= setTimeout(reread, 250);
  });
  s.observer.observe(target, { childList: true, subtree: true });
}
