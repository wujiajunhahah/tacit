// Markup and styles of the dashboard, in the extension capsule's tokens; no external assets.

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.3'/%3E%3C/svg%3E\")";

const STYLE = `
:root {
  --paper: #fafaf7; --ink: #17161c; --ink-2: rgba(23, 22, 28, .62); --ink-3: rgba(23, 22, 28, .42);
  --rule: rgba(23, 22, 28, .1); --wash: rgba(23, 22, 28, .035);
  --lime: hsl(78, 72%, 40%); --lime-ink: hsl(78, 72%, 27%); --on-lime: #17161c; --danger: #b42318;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --serif: ui-serif, "New York", "Iowan Old Style", Georgia, serif;
  --serif-cjk: "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", ui-serif, serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #16151a; --ink: #eeedf2; --ink-2: rgba(238, 237, 242, .64); --ink-3: rgba(238, 237, 242, .42);
    --rule: rgba(238, 237, 242, .12); --wash: rgba(238, 237, 242, .05);
    --lime: hsl(78, 70%, 62%); --lime-ink: hsl(78, 70%, 62%); --on-lime: #16151a; --danger: #f97066;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 var(--sans); -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
a:hover { color: var(--lime-ink); }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 1.5px solid var(--ink); outline-offset: 3px; }
/* Headings take focus on navigation, for screen readers; they are not controls, so no ring. */
h1[tabindex]:focus, h1[tabindex]:focus-visible { outline: none; }
p, ol, ul, dl, dd, figure, blockquote { margin: 0; }
ol, ul { padding: 0; list-style: none; }
/* Monospace is for code (tool names, paths); times, counts and other metadata use the sans with tabular figures. */
.mono { font-family: var(--mono); }
.meta { font-variant-numeric: tabular-nums; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.skip { position: absolute; left: -9999px; top: 12px; padding: 6px 10px; background: var(--paper); }
.skip:focus { left: 16px; }

.you { font-family: var(--serif); font-style: italic; }
.you.cjk { font-family: var(--serif-cjk); font-style: normal; }

.page { max-width: 1120px; margin: 0 auto; padding: 40px 40px 80px; }
.masthead { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 24px; padding-bottom: 14px; border-bottom: 1px solid var(--ink); }
.brand { display: inline-flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: var(--ink); }
.brand:hover { color: var(--ink); }
.mark { position: relative; width: 14px; height: 14px; border-radius: 3px; background: #17161c; box-shadow: 0 0 0 1px var(--rule); }
.mark::after { content: ''; position: absolute; inset: 5px; background: #9ecd2e; transform: rotate(45deg); }
.brand .sub { font-weight: 400; color: var(--ink-3); }
.status { font-size: 12px; color: var(--ink-3); }
.status.is-off { color: var(--ink); }
.nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 24px; margin-top: 10px; }
.nav ol { display: flex; flex-wrap: wrap; gap: 2px 22px; }
.nav a { display: inline-block; padding: 5px 0; border-bottom: 2px solid transparent; font-size: 14px; color: var(--ink-2); }
.nav a:hover { color: var(--ink); }
.nav a[aria-current="page"] { border-bottom-color: var(--ink); color: var(--ink); }
.view { max-width: 760px; margin-top: 52px; outline: none; }
.label { margin: 0 0 18px; font-size: 13px; font-weight: 500; color: var(--ink-2); }
.section { margin-top: 48px; }
.section-note, .quiet-note { margin-top: 12px; font-size: 13px; color: var(--ink-3); }
.lede { max-width: 36em; font-size: 17px; line-height: 1.6; color: var(--ink-2); }
.sentence { margin-top: 8px; font-size: 15px; color: var(--ink-2); }
.sentence code, .lede code { font-size: .86em; color: var(--ink); }
.error { font-size: 15px; color: var(--ink); }
.empty { margin-top: 8px; }
.empty-title { font-size: 22px; font-weight: 500; letter-spacing: -.01em; }
.empty-body { margin-top: 10px; max-width: 36em; font-size: 16px; line-height: 1.6; color: var(--ink-2); }
.done { margin-top: 28px; }

button { font: inherit; color: inherit; }
.btn { padding: 11px 16px; border: 1px solid var(--ink); border-radius: 3px; background: var(--ink); color: var(--paper); font: 500 14px/1 var(--sans); cursor: pointer; }
.btn:hover { border-color: var(--lime); background: var(--lime); color: var(--on-lime); }
.quiet { padding: 5px 0; border: 0; background: none; color: var(--ink-2); font: 14px var(--sans); cursor: pointer; }
.quiet:hover { color: var(--ink); }
.quiet[aria-pressed="true"] { color: var(--ink); box-shadow: inset 0 -2px var(--lime); }
.quiet:disabled, .danger:disabled { opacity: .5; cursor: default; }
.danger { padding: 10px 14px; border: 1px solid var(--danger); border-radius: 3px; background: transparent; color: var(--danger); font: 500 14px/1 var(--sans); cursor: pointer; }
.danger:hover, .danger.solid { background: var(--danger); color: var(--paper); }
.danger-quiet { padding: 5px 0; border: 0; background: none; color: var(--danger); font: 14px var(--sans); cursor: pointer; }
.danger-quiet:hover { text-decoration: underline; text-underline-offset: 3px; }
.detail-end { margin-top: 64px; padding-top: 16px; border-top: 1px solid var(--rule); }

.intent { max-width: 17em; font-size: clamp(30px, 3.6vw, 42px); line-height: 1.12; letter-spacing: -.01em; text-wrap: balance; }
.intent.is-quiet { font-size: clamp(26px, 3vw, 34px); color: var(--ink-3); }
.confidence { display: flex; align-items: center; gap: 12px; margin-top: 18px; font-size: 12px; color: var(--ink-2); }
.evidence { margin-top: 22px; padding-left: 16px; border-left: 1px solid var(--rule); font-size: 15px; color: var(--ink-2); }
.evidence li + li { margin-top: 6px; }
.evidence .you { color: var(--ink); }
.when { margin-left: 10px; font-size: 12px; color: var(--ink-3); }
.others { margin-top: 14px; font-size: 13px; color: var(--ink-3); }
.reading { margin-top: 36px; padding-top: 18px; border-top: 1px solid var(--rule); }
.kicker { font-size: 12px; color: var(--ink-3); }
.reading-title { margin-top: 4px; font-size: 19px; font-weight: 500; line-height: 1.35; }
.reading-meta { margin-top: 4px; font-size: 14px; color: var(--ink-2); }
.out { margin-left: 4px; font-size: 13px; color: var(--ink-3); }
.handoff { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: 28px; }
.cost { font-size: 12px; color: var(--ink-3); }
.note { font-size: 13px; color: var(--lime-ink); }

.search-field { width: 100%; padding: 10px 0; border: 0; border-bottom: 1px solid var(--ink); border-radius: 0; background: transparent; color: var(--ink); font: 19px var(--sans); }
.search-field:focus { outline: none; border-bottom-color: var(--lime); }
.search-field::placeholder { color: var(--ink-3); }
.search-field::-webkit-search-cancel-button { -webkit-appearance: none; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; margin: 14px 0 22px; font-size: 13px; color: var(--ink-3); }
select { appearance: none; padding: 5px 18px 5px 0; border: 0; border-bottom: 1px solid var(--rule); border-radius: 0; background: transparent ${CHEVRON} no-repeat right center; color: var(--ink-2); font: 14px var(--sans); cursor: pointer; }
.seg { display: flex; gap: 16px; }
.hint { margin-left: auto; font-size: 11px; }
.rows { border-top: 1px solid var(--rule); }
.row { padding: 16px 0; border-bottom: 1px solid var(--rule); }
.row-title { font-size: 16px; font-weight: 500; line-height: 1.4; }
.row-meta { margin-top: 4px; font-size: 13px; color: var(--ink-3); }
.row-snip { margin-top: 6px; font-size: 14px; line-height: 1.55; color: var(--ink-2); }
.row-empty { padding: 18px 0; font-size: 15px; color: var(--ink-2); }
.more { margin-top: 18px; }

.back { font-size: 13px; color: var(--ink-2); }
.detail-title { margin: 18px 0 0; font-size: 30px; line-height: 1.18; font-weight: 500; letter-spacing: -.015em; text-wrap: balance; }
.detail-meta { margin-top: 8px; font-size: 14px; color: var(--ink-2); }
.facts { margin-top: 4px; font-size: 12px; color: var(--ink-3); }
.after { margin-top: 18px; font-size: 16px; color: var(--ink-2); }
.after .you { color: var(--ink); }
.confirm { margin-top: 18px; padding: 16px 18px; border-left: 2px solid var(--danger); background: var(--wash); }
.confirm-text { font-size: 15px; }
.confirm .buttons { display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: center; margin-top: 14px; }
.reads li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 24px; padding: 12px 0; border-bottom: 1px solid var(--rule); }
.reads li:first-child { border-top: 1px solid var(--rule); }
.read-text { font-size: 15px; line-height: 1.6; }
.ms { padding-top: 4px; font-size: 12px; color: var(--ink-3); white-space: nowrap; }
.said + .said { margin-top: 18px; }
.quote { margin: 0; padding-left: 14px; border-left: 2px solid var(--rule); font-size: 17px; line-height: 1.5; }
.quote-meta { margin: 6px 0 0 16px; font-size: 12px; color: var(--ink-3); }
.arrivals li { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--rule); font-size: 14px; color: var(--ink-2); }
.arrivals time { font-size: 12px; color: var(--ink-3); padding-top: 2px; }
.arrivals .you { color: var(--ink); }
.outline li { padding: 3px 0 3px calc(var(--depth, 0) * 16px); font-size: 14px; color: var(--ink-2); }

.thread + .thread { margin-top: 40px; }
.thread-head { display: flex; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--ink); font-size: 12px; color: var(--ink-3); }
.visit { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--rule); }
.visit > time { padding-top: 3px; font-size: 12px; color: var(--ink-3); }
.visit.is-current > time { color: var(--lime-ink); }
.v-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
.v-title { font-size: 16px; font-weight: 500; line-height: 1.4; }
.v-domain { font-size: 13px; color: var(--ink-3); }
.v-arrival { margin-top: 4px; font-size: 14px; color: var(--ink-2); }
.v-arrival .you { color: var(--ink); }
.v-meta { margin-top: 6px; font-size: 12px; color: var(--ink-3); }
.visit .quote { margin-top: 10px; font-size: 15px; color: var(--ink-2); }

.entries li { padding: 12px 0; border-bottom: 1px solid var(--rule); }
.e-head { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; color: var(--ink-2); }
.e-head time { color: var(--ink-3); }
.state-confirmed .e-state { color: var(--ink); }
.state-executed .e-state { color: var(--lime-ink); }
.state-undone .e-label, .state-dismissed .e-label { color: var(--ink-3); text-decoration: line-through; }
.e-label { margin-top: 4px; font-size: 14px; line-height: 1.4; }
.e-reason { margin-top: 2px; font-size: 12px; color: var(--ink-2); }

.sentences li { padding: 10px 0; border-bottom: 1px solid var(--rule); font-size: 15px; }
.sentences li:first-child { border-top: 1px solid var(--rule); }
.code { margin: 12px 0 0; padding: 14px 16px; border-radius: 6px; background: var(--wash); font: 13px/1.55 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.code + .handoff { margin-top: 10px; }
.tools { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 22px; font-size: 14px; }
.tools dt { font-size: 13px; color: var(--ink); }
.tools dd { color: var(--ink-2); }

.colophon { margin-top: 96px; padding-top: 14px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--ink-3); }
@media (max-width: 720px) {
  .page { padding: 28px 20px 64px; }
  .view { margin-top: 36px; }
  .hint { display: none; }
  .arrivals li { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
`;

export function shell(nonce: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Tacit</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<a class="skip" id="skip" href="#view">Skip to content</a>
<div class="page">
  <header class="masthead">
    <a class="brand" href="#/now"><span class="mark" aria-hidden="true"></span>Tacit<span class="sub" id="brand-sub"></span></a>
    <p class="status meta" id="status" aria-live="polite"></p>
  </header>
  <nav class="nav" id="nav"><ol id="nav-links"></ol><button class="quiet lang" id="lang" type="button"></button></nav>
  <main class="view" id="view" tabindex="-1"></main>
  <footer class="colophon" id="colophon"></footer>
</div>
<script nonce="${nonce}">${script}</script>
</body>
</html>`;
}
