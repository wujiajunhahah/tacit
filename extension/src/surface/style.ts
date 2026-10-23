// A margin note in ink. The user's own words are set in italic serif; everything Tacit says is in sans.

export const CAPSULE_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.tc {
  --ink: #17161c;
  --ink-soft: #3a3940;
  --ink-2: rgba(23, 22, 28, .6);
  --ink-3: rgba(23, 22, 28, .4);
  --paper: rgba(251, 250, 247, .95);
  --paper-solid: #fbfaf7;
  --rule: rgba(23, 22, 28, .1);
  --hover: rgba(23, 22, 28, .045);
  --open-w: min(460px, calc(100vw - 32px));
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translate(-50%, 6px);
  opacity: 0;
  z-index: 2147483646;
  font: 400 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  color: var(--ink-soft);
  -webkit-font-smoothing: antialiased;
  /* Lets the line change width to and from its natural size: the line grows into the slip instead of jumping. */
  interpolate-size: allow-keywords;
  transition: opacity .14s ease-out, transform .14s ease-out;
}
.tc[data-ready] { opacity: 1; transform: translate(-50%, 0); }
@media (prefers-color-scheme: dark) {
  .tc {
    --ink: #efeef3;
    --ink-soft: #d6d5db;
    --ink-2: rgba(239, 238, 243, .62);
    --ink-3: rgba(239, 238, 243, .4);
    --paper: rgba(23, 22, 27, .95);
    --paper-solid: #17161b;
    --rule: rgba(239, 238, 243, .12);
    --hover: rgba(239, 238, 243, .06);
  }
}
button { all: unset; cursor: pointer; }
button:focus-visible { outline: 1px solid var(--ink); outline-offset: 2px; border-radius: 4px; }
kbd { display: none; font: 500 10.5px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-3); }
.tc[data-keys] kbd { display: inline; }
/* Open, each row shows its digit: pressed alone, it picks the row. With ⌥ held, the closed line's keys show too. */
.tc[data-open] .sug kbd, .tc[data-open] .choice kbd { display: inline; }
.tc:not([data-keys]) kbd .alt { display: none; }
.you { font: italic 400 15px/1.25 ui-serif, "New York", "Iowan Old Style", Georgia, serif; color: var(--ink); letter-spacing: 0; }
/* Upright for CJK, which has no true italic; Latin words inside keep the serif of English intents. */
.you[data-cjk] { font-style: normal; font-family: ui-serif, "New York", "Iowan Old Style", Georgia, "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif; }
.tc:lang(zh-CN) { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif; }
.code { font: 450 12px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink); }
.muted { color: var(--ink-3); }
u { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: var(--ink-3); }

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: min(520px, calc(100vw - 32px));
  height: 34px;
  margin: 0 auto;
  padding: 0 13px 0 12px;
  background: var(--paper);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  border: 1px solid var(--rule);
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
  cursor: pointer;
  transition: width .22s cubic-bezier(.2, .8, .2, 1), padding .22s cubic-bezier(.2, .8, .2, 1), border-radius .22s ease-out, background-color .22s ease-out;
}
.lc { display: contents; }
/* The glyph is ink: empty when Tacit only listens, half when it suggests, full when it would act. It fills in place. */
.glyph { position: relative; flex: none; width: 6px; height: 6px; transform: rotate(45deg); box-shadow: inset 0 0 0 1.1px var(--ink); }
.glyph::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--ink);
  clip-path: polygon(0 0, 0 0, 0 0, 0 0);
  transition: clip-path .26s cubic-bezier(.2, .8, .2, 1);
}
[data-mode="suggest"] .glyph::after { clip-path: polygon(0 0, 100% 0, 0 100%, 0 100%); }
[data-mode="act"] .glyph::after { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
.say { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; white-space: nowrap; overflow: hidden; }
.say .obj { color: var(--ink); overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.say .you { font-size: 14px; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.say .src { flex: none; color: var(--ink-3); }
[data-mode="ask"] .line, [data-mode="quiet"] .line { width: 30px; padding: 0; justify-content: center; }
[data-mode="ask"] .say, [data-mode="quiet"] .say { display: none; }

/* Open, the slip and the line are one sheet of solid paper: nothing behind shows through. */
.slip {
  position: absolute;
  left: 50%;
  bottom: calc(100% - 1px);
  width: var(--open-w);
  padding: 12px 16px 10px;
  background: var(--paper-solid);
  border: 1px solid var(--rule);
  border-bottom-color: transparent;
  border-radius: 6px 6px 0 0;
  max-height: min(60vh, 480px);
  overflow: auto;
  opacity: 0;
  transform: translate(-50%, 4px);
  pointer-events: none;
  transition: opacity .14s ease-out, transform .14s ease-out;
}
.tc[data-open] .slip { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.tc[data-open] .line { width: var(--open-w); background: var(--paper-solid); border-radius: 0 0 6px 6px; border-top-color: transparent; box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
.tc[data-open] .say { display: flex; }
.tc[data-open][data-mode="ask"] .line, .tc[data-open][data-mode="quiet"] .line { padding: 0 13px 0 12px; justify-content: flex-start; }

.sugs { list-style: none; margin: 0; padding: 0; }
.sug { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 5px 0; color: var(--ink-soft); }
.sug:hover .l { color: var(--ink); }
.sug .v { flex: none; color: var(--ink-3); }
.sug .l { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choices { display: flex; flex-direction: column; gap: 2px; }
.choice { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 5px 0; color: var(--ink-soft); }
.choice .l { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choice:hover .l { color: var(--ink); }
.note { margin: 0; font-size: 12px; color: var(--ink-3); }
pre { margin: 12px 0 0; max-height: 32vh; overflow: auto; white-space: pre-wrap; font: 11px/1.55 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-2); }
.tools { display: flex; align-items: center; gap: 14px; margin-top: 12px; font-size: 12px; }
.tools button { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
.tools button:hover, .tools button[aria-pressed="true"] { color: var(--ink); }
.tools .gap { flex: 1; }

/* A confirmation takes the line's place for a few seconds, even where the line is only a dot. */
.tc[data-note] .line { width: max-content; padding: 0 8px 0 12px; justify-content: flex-start; }
.tc[data-note] .say { display: flex; }
.act { flex: none; padding: 2px 4px; border-radius: 4px; color: var(--ink-2); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--ink-3); }
.act:hover { color: var(--ink); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .tc, .slip, .line, .glyph::after { transition: none; } }
`;
