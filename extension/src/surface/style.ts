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
.you { font: italic 400 15px/1.25 ui-serif, "New York", "Iowan Old Style", Georgia, serif; color: var(--ink); letter-spacing: 0; }
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
}
.glyph { flex: none; width: 6px; height: 6px; transform: rotate(45deg); box-shadow: inset 0 0 0 1.1px var(--ink); }
[data-mode="act"] .glyph { background: var(--ink); }
[data-mode="suggest"] .glyph { background: linear-gradient(135deg, var(--ink) 50%, transparent 50%); }
.say { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; white-space: nowrap; overflow: hidden; }
.say .obj { color: var(--ink); overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.say .you { font-size: 14px; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.say .src { flex: none; color: var(--ink-3); }
[data-mode="ask"] .line, [data-mode="quiet"] .line { width: 30px; padding: 0; justify-content: center; }
[data-mode="ask"] .say, [data-mode="quiet"] .say { display: none; }

.slip {
  position: absolute;
  left: 50%;
  bottom: calc(100% - 1px);
  width: var(--open-w);
  padding: 14px 16px 10px;
  background: var(--paper);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
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
.tc[data-open] .line { width: var(--open-w); max-width: none; border-radius: 0 0 6px 6px; border-top-color: transparent; box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
.tc[data-open] .say { display: flex; }
.tc[data-open][data-mode="ask"] .line, .tc[data-open][data-mode="quiet"] .line { padding: 0 13px 0 12px; justify-content: flex-start; }

.intent { margin: 0; }
.prov { margin: 3px 0 0; font-size: 12px; color: var(--ink-3); }
.sugs { list-style: none; margin: 12px 0 0; padding: 0; }
.sug { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 5px 0; color: var(--ink-soft); }
.sug:hover .l { color: var(--ink); }
.sug .v { flex: none; color: var(--ink-3); }
.sug .l { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choices { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-top: 2px; }
.choice { padding: 4px 0; color: var(--ink-soft); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choice:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--ink-3); }
.note { margin: 0; font-size: 12px; color: var(--ink-3); }
pre { margin: 12px 0 0; max-height: 32vh; overflow: auto; white-space: pre-wrap; font: 11px/1.55 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink-2); }
.tools { display: flex; align-items: center; gap: 14px; margin-top: 12px; font-size: 12px; }
.tools button { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); }
.tools button:hover, .tools button[aria-pressed="true"] { color: var(--ink); }
.tools .gap { flex: 1; }

.toast {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translate(-50%, 4px);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 7px 8px 7px 12px;
  white-space: nowrap;
  background: var(--ink);
  color: var(--paper-solid);
  border-radius: 6px;
  font-size: 12.5px;
  opacity: 0;
  pointer-events: none;
  transition: opacity .14s ease-out, transform .14s ease-out;
}
.toast span { overflow: hidden; text-overflow: ellipsis; }
.toast button { padding: 2px 6px; border-radius: 4px; color: var(--paper-solid); opacity: .75; text-decoration: underline; text-underline-offset: 3px; }
.toast button:hover { opacity: 1; }
.tc[data-toast] .toast { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.tc[data-toast][data-open] .toast { opacity: 0; pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .tc, .slip, .toast { transition: none; } }
`;
