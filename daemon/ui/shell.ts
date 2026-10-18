// Markup and styles of the ledger UI, in the extension capsule's tokens; no external assets.

const STYLE = `
:root {
  --paper: #fafaf7; --ink: #17161c; --ink-2: rgba(23, 22, 28, .62); --ink-3: rgba(23, 22, 28, .42);
  --rule: rgba(23, 22, 28, .1);
  --lime: hsl(78, 72%, 40%); --lime-ink: hsl(78, 72%, 27%); --on-lime: #17161c;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #16151a; --ink: #eeedf2; --ink-2: rgba(238, 237, 242, .64); --ink-3: rgba(238, 237, 242, .42);
    --rule: rgba(238, 237, 242, .12);
    --lime: hsl(78, 70%, 62%); --lime-ink: hsl(78, 70%, 62%); --on-lime: #16151a;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 var(--sans); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
a:hover { color: var(--lime-ink); }
a:focus-visible, button:focus-visible, input:focus-visible { outline: 1.5px solid var(--ink); outline-offset: 3px; }
p, ol, ul { margin: 0; }
.mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.page { max-width: 1120px; margin: 0 auto; padding: 48px 40px 88px; }
.masthead { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 24px; padding-bottom: 14px; border-bottom: 1px solid var(--ink); }
.brand { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: .01em; }
.brand span { margin-left: 10px; font-weight: 400; color: var(--ink-3); }
.status { font-size: 12px; color: var(--ink-3); }
.status.is-off { color: var(--ink); }
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 88px; margin-top: 56px; }
.main > section + section { margin-top: 72px; }
.side { display: grid; gap: 64px; align-content: start; }
.label { margin: 0 0 18px; font-size: 13px; font-weight: 500; color: var(--ink-2); }

.intent { max-width: 17em; font-size: clamp(28px, 3.4vw, 40px); line-height: 1.12; font-weight: 500; letter-spacing: -.02em; text-wrap: balance; }
.intent.is-quiet { color: var(--ink-3); }
.confidence { display: flex; align-items: center; gap: 12px; margin-top: 18px; font-size: 12px; color: var(--ink-2); }
.meter { position: relative; width: 120px; height: 2px; background: var(--rule); }
.meter i { position: absolute; top: 0; bottom: 0; left: 0; background: var(--lime); }
.evidence { list-style: none; margin-top: 22px; padding-left: 16px; border-left: 1px solid var(--rule); font-size: 15px; color: var(--ink-2); }
.evidence li + li { margin-top: 6px; }
.when { margin-left: 10px; font-size: 12px; color: var(--ink-3); }
.others { margin-top: 14px; font-size: 13px; color: var(--ink-3); }
.reading { margin-top: 36px; padding-top: 18px; border-top: 1px solid var(--rule); }
.kicker { font-size: 12px; color: var(--ink-3); }
.reading-title { display: inline-block; margin-top: 4px; font-size: 19px; font-weight: 500; line-height: 1.35; }
.reading-meta { margin-top: 4px; font-size: 14px; color: var(--ink-2); }
.handoff { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: 28px; }
button { padding: 12px 18px; border: 1px solid var(--ink); border-radius: 3px; background: var(--ink); color: var(--paper); font: 500 14px/1 var(--sans); cursor: pointer; }
button:hover { border-color: var(--lime); background: var(--lime); color: var(--on-lime); }
.cost { font-size: 12px; color: var(--ink-3); }
.note { font-size: 13px; color: var(--lime-ink); }

.thread + .thread { margin-top: 40px; }
.thread-head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--ink); font-size: 12px; color: var(--ink-3); }
.visits { list-style: none; padding: 0; }
.visit { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--rule); }
.visit > time { padding-top: 3px; font-size: 12px; color: var(--ink-3); }
.visit.is-current > time { color: var(--lime-ink); }
.v-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
.v-title { font-size: 16px; font-weight: 500; line-height: 1.4; }
.v-domain { font-size: 13px; color: var(--ink-3); }
.v-arrival { margin-top: 4px; font-size: 14px; color: var(--ink-2); }
.v-meta { margin-top: 6px; font-size: 12px; color: var(--ink-3); }
blockquote { margin: 10px 0 0; padding-left: 12px; border-left: 2px solid var(--rule); font-size: 14px; color: var(--ink-2); }

.search input { width: 100%; padding: 8px 0; border: 0; border-bottom: 1px solid var(--ink); border-radius: 0; background: transparent; color: var(--ink); font: 16px var(--sans); }
.search input:focus { outline: none; border-bottom-color: var(--lime); }
.search input::placeholder { color: var(--ink-3); }
.search input::-webkit-search-cancel-button { -webkit-appearance: none; }
.results, .entries { list-style: none; padding: 0; }
.results li, .entries li { padding: 14px 0; border-bottom: 1px solid var(--rule); }
.count { margin-top: 10px; font-size: 12px; color: var(--ink-3); }
.r-title { font-size: 15px; font-weight: 500; line-height: 1.35; }
.r-meta { margin-top: 2px; font-size: 12px; color: var(--ink-3); }
.r-snip { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--ink-2); }
.e-head { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-2); }
.e-head time { color: var(--ink-3); }
.state-confirmed .e-state { color: var(--ink); }
.state-executed .e-state { color: var(--lime-ink); }
.state-undone .e-label, .state-dismissed .e-label { color: var(--ink-3); text-decoration: line-through; }
.e-label { margin-top: 4px; font-size: 14px; line-height: 1.4; }
.e-reason { margin-top: 2px; font-size: 12px; color: var(--ink-2); }
.entries li.quiet, .quiet { border: 0; font-size: 14px; color: var(--ink-3); }
.empty { margin: 80px 0 40px; max-width: 34em; font-size: 19px; line-height: 1.5; color: var(--ink-2); }
.colophon { margin-top: 96px; padding-top: 14px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--ink-3); }
@media (max-width: 920px) {
  .page { padding: 32px 22px 72px; }
  .grid { grid-template-columns: minmax(0, 1fr); gap: 64px; margin-top: 40px; }
  .main, .side { display: contents; }
  .main > section + section { margin-top: 0; }
  #sec-search { order: 1; }
  #sec-trail { order: 2; }
  #sec-ledger { order: 3; }
}
`;

export function shell(nonce: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Tacit · context ledger</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<div class="page">
  <header class="masthead">
    <h1 class="brand">Tacit<span>context ledger</span></h1>
    <p class="status mono" id="status">connecting…</p>
  </header>
  <p class="empty" id="empty" hidden>Nothing here yet. Load the Tacit extension in Chrome (chrome://extensions → Developer mode → Load unpacked → the tacit/extension folder) and open a page; everything stays on this machine.</p>
  <div class="grid" id="grid" hidden>
    <div class="main">
      <section aria-labelledby="now-label"><h2 class="label" id="now-label">Now</h2><div id="now"></div></section>
      <section id="sec-trail" aria-labelledby="trail-label"><h2 class="label" id="trail-label">Trail</h2><div id="trail"></div></section>
    </div>
    <aside class="side">
      <section class="search" id="sec-search" aria-labelledby="search-label">
        <h2 class="label" id="search-label">Search what you read</h2>
        <input id="q" type="search" placeholder="latency, 上下文 …" autocomplete="off" spellcheck="false" aria-labelledby="search-label">
        <p class="count mono" id="count" aria-live="polite"></p>
        <ol class="results" id="results"></ol>
      </section>
      <section id="sec-ledger" aria-labelledby="ledger-label"><h2 class="label" id="ledger-label">Harness ledger</h2><ol class="entries" id="ledger"></ol></section>
    </aside>
  </div>
  <footer class="colophon" id="colophon">Your ledger stays on this machine.</footer>
</div>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
}
