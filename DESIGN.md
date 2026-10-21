English · [简体中文](DESIGN.zh-CN.md)

# Design

How Tacit decides what to show, when to act, and what to learn. [The manifesto](MANIFESTO.md) is the why; this is the how. Read it before adding a signal, a surface, or a word of copy.

## North star

**Less input.** A feature is worth exactly the typing, clicking and explaining it takes away. Anything that adds a setting, a surface or a key must remove more than it adds.

## Principles

1. **Unfelt by default.** Tacit sits at the edge of attention: one line at the bottom edge of the page, below where you read. The slip opens only when you reach for it. Nothing makes a sound, shows a badge or asks for onboarding.
2. **Every guess shows its source.** The line says where a guess came from in three words ("from your search"); the slip adds when and how sure; the ledger keeps the rest.
3. **Confidence decides, not modes.** Tacit acts, suggests or asks, and `confidence = intent × action` picks which: from 0.6 the line offers the act on ⌥↵, from 0.35 it suggests, below that it asks with choices taken from the page. Nothing runs without a key or a click, except folding, which one click reverses.
4. **Fold, never hide.** Every fold has a label with a count and opens in one click. Tacit folds only when it is sure and the feed clearly has something for you (two relevant posts or more). Conversations are never folded.
5. **Undo is the feedback.** Undoing and unfolding are signals. Calibration turns them into thresholds, so nobody tunes anything.
6. **Local first.** The ledger is SQLite in `~/.tacit`. Nothing leaves the machine unless you set a key for Jev. Private paths such as X messages are never read. Anything that gives Tacit more power lives in UI the extension owns, because a page can draw a fake line.
7. **Your language.** English and Simplified Chinese. Copy is short and starts with a verb; your own words stay in your script; CJK is never set in synthetic italics.

## The loop

```
  capture ──▶ ledger ──▶ intent ──▶ reflex ──▶ surface
     ▲                                            │
     └──── calibrate ◀──── feedback ◀─────────────┘
```

| Stage | What happens | Where |
|---|---|---|
| Capture | Pages, arrivals, searches, selections, copies, clicks, reading. Data only, no UI. | `extension/src/extract`, `track.ts`, `attention.ts` |
| Ledger | Every visit, and every action with its state. | `daemon/db.ts`, `~/.tacit` |
| Intent | Evidence decays (15 min half-life, 90 min window) into one guess and its alternatives. | `core/intent.ts` |
| Reflex | Ranks next actions and passages. Jev proposes when enabled; the policy decides. | `core/decision.ts`, `core/jev.ts`, `core/policy.ts` |
| Surface | The line, the slip, margin marks, folds. | `extension/src/surface` |
| Feedback | `executed`, `undone`, `dismissed`. | `core/ledger.ts` |
| Calibrate | Moves the act threshold with your undo rate (0.5–0.8); stops folding on sites where you keep unfolding. | `core/calibrate.ts` |
| Port | The packet (⌥⇧C) and five read-only MCP tools hand agents the same context. | `core/packet.ts`, `daemon/mcp.ts` |

Every turn runs locally in milliseconds; Jev, when enabled, only refines it. Scaling up means more senses feeding the same ledger, not more UI.

## Who decides

Every decision in the loop has one owner. Prefer them in this order:

| Owner | Takes | Never takes |
|---|---|---|
| **Code** | Anything that follows from rules, or runs on every event: privacy, extraction, attention, intent, the gate, calibration, the packet. | |
| **Pre-written** | Everything people or models read: copy in both languages, the packet's structure, the questions put to a model, the setup prompt. | |
| **A small typed model** (Jev, optional) | Judgments of meaning that must come back in under ~400 ms as a typed answer: a choice, a score, a yes or no. | The final say: its answer goes through the gate. |
| **A large model** (your own agent) | Open-ended work: explain, write, plan, act across tools. Only through the port, only when you ask. | Anything Tacit does on its own. |

You own everything irreversible or outward-facing.

| Decision | Owner | Budget | If it fails |
|---|---|---|---|
| Read this page at all? | Code, with your rules: pause, never-read list, private paths | < 1 ms | Do not read |
| What is on it, and what kind of page? | Code: article, feed, repository, search | < 30 ms | The generic reader |
| How did you get here? | Code: navigation events, the referrer | < 1 ms | "Unknown" |
| What counts as reading? | Code; thresholds pre-written, the pointer's yours | every 500 ms | Nothing counts |
| What are you after, and how sure? | Code: weights, decay, softmax | < 5 ms | Ask |
| Which step next, and which posts matter? | Jev when on, in one batched call (a choice, up to 40 yes/no); else the local engine | 2.5 s cap; the local answer shows first | The local engine |
| Which passages answer you? | Code: ranking against your words | < 5 ms | No marks |
| Act, suggest or ask? | Code: combined confidence against the calibrated thresholds | < 1 ms | Ask |
| What does the line say? | Pre-written copy, filled with your words and the page's | | |
| What does the agent get? | Code fills a pre-written packet; nothing is paraphrased | < 10 ms | The outline |
| Did it work? | You: keep, undo, unfold | | |
| Should the bar move? | Code: calibration, explained in the dashboard | < 5 ms | The defaults |
| What to do with the context? | Your agent's model, through MCP | the agent's | |

Per visit: at most one model call, batched, and no large-model calls. Everything else is code you can read and test.

**Branches.** No harness: the extension works alone. No key, an error or a timeout: the local engine. Unsure: ask, with choices. An unfamiliar machine at setup: your agent, with a pre-written prompt, while a script does the deterministic steps.

**Adding a model.** A new small model answers the same three typed questions within the budget, keeps the local engine as its fallback, and sees no more than a decision request carries ([PRIVACY.md](PRIVACY.md) lists it). A large model never joins the loop; it stays behind the port.

## Signals

| Kind | Base | Counts when | Can name the intent |
|---|---|---|---|
| `stated` | 6 | You pick a choice or say what you want. Lasts 45 min. | yes |
| `search` | 4 | You search. An older search keeps 0.35 of its weight once a newer one exists. | yes |
| `copy` | 3.5 | You copy text. | yes |
| `selection` | 3 | You select text. | yes |
| `read` | 2 | A passage gets 4 s of reading in the reading band, the middle 40% of the screen (time there is split by how much of the band each passage fills), or the pointer rests on it, if you turned that on. | no; it adds weight to words |
| `click` | 1.5 | You follow a link or press a button. | no |
| `dwell` | 1.2 | You stay on a page. | yes |
| `title` | 0.8 | The page has a title. | yes |

Reading is scaled by how it was seen (pointer ×1.2, view ×0.5) and by time, `min(1.5, 0.35 + ms / 8000)`. Skimming (over 1,500 px/s), a minute without input, hidden tabs and a fast-moving pointer do not count. Reading with the pointer is off by default; its threshold runs from 0.6 to 4 s and starts at 1.2 s.

**Adding a signal**

1. It must be something people already do. Never ask for a new gesture.
2. Capture it as data. It gets no UI of its own.
3. Give it a base weight below `stated`, and decide whether it can name the intent or only add weight to words.
4. Ignore it while skimming, idle, hidden or on a private path.
5. Make it visible: three words in the slip, a line in the packet, an entry in the ledger.
6. Test it three ways: a unit test for weight and decay, a browser test on the demo site, a check on one real site.

## Surfaces

| Surface | Contract |
|---|---|
| Line | One line, bottom center: what is next, then where the guess came from. With nothing to say it shrinks to a 30 px dot. |
| Slip | Opens on hover: up to three next steps (⌥1–3), or up to three choices when Tacit asks, then copy for agent, focus, undo, pause. Open, the line becomes its header: your intent in your words and where it came from, so nothing is said twice. |
| Marks | 2 px of ink in the margin, in the page's own text color. No backgrounds, no badges. |
| Folds | "Folded 7 posts · show". One click opens the whole run. |
| Confirmation | In the line itself, never a second layer: one sentence and at most one action (Undo), for up to 5 s. |
| Popup | Consent and settings. The extension owns it, so no page can fake it. |
| Dashboard | The ledger and the context library, served by the local harness. |

**Copy.** Verbs first ("Jump to", "Copy for agent"). One name per action, everywhere. Sources in three words. No exclamation marks; never "AI" or "smart". Your words are set in serif italic, Tacit's in sans with tabular figures, code in monospace.

**Keys.** ⌥↵ runs the first suggestion, ⌥1–3 picks one (or a choice, when Tacit asks), ⌥⇧C copies for your agent, ⌥⇧F focuses, ⌥⇧Z undoes, Esc closes. Hints appear only while ⌥ is held.

**Color and motion.** Ink on paper, in light and dark, with one accent from the mark, lime, for done and for hover, never for decoration. Transitions take 140 ms and switch off under reduced motion.

## Hard parts, solved

- **Virtual timelines (X).** X recycles the DOM of posts that scroll away, so a `FeedMemory` keeps every post you passed. A re-rendered post gets its marks back in the mutation callback, before paint, so nothing flashes open. New posts are ranked on a 250 ms throttle while you scroll, not a debounce, so they are folded before they reach the screen. Jev is asked only once the feed settles. Unfolding goes by the whole run, not by what is in the DOM.
- **Single-page apps.** A history change starts a new visit; moving into a private path stops Tacit at once.
- **Forged consent.** The line lives in the page, and the page can draw a copy of it. Resuming, enabling Jev and connecting agents happen only in the popup or the dashboard.
- **Deleting everywhere.** The extension keeps its own copy of the trail. A deletion in the dashboard leaves a tombstone, a hash of the address and a time: the harness refuses anything older, and the extension forgets the same the next time it checks in.

## Borrowing

Tacit studies other tools. Five rules keep it from imitating them:

1. Borrow interaction primitives and architecture; never visual style, brand, persona or copy.
2. Borrow only what cuts input or attention.
3. Restate it in Tacit's nouns (page, line, slip, ledger, packet), then test it on the demo site and on one real site.
4. Cite the source, with a link and the date checked. Check the license before reading code.
5. Refuse anything that weakens local first. Recheck sources at every release.

| From | Taken | Left |
|---|---|---|
| [OpenCode](https://opencode.ai/docs/server/) | One local server with thin clients. Allow / ask / deny, as act / suggest / ask. Background workers stay invisible. | Modes the user has to switch. |
| [Muse (Meta)](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) | The proposer is not the approver: Jev proposes, the policy decides. Consent no page can forge. | A persona. Autonomy in the cloud. |
| [Typeless](https://www.typeless.com/) | Output lands where you already are. One key, one cue. Keep the final intent. Learn from corrections. | Progress meters for personalization. |
| [Calm technology](https://calmtech.com/papers/designing-calm-technology.html) | The periphery and the center of attention. The line still works without the harness. | |
| [Apple's HIG](https://web.archive.org/web/2020/https://developer.apple.com/design/human-interface-guidelines/ios/overview/themes/) | Deference: never cover content. | |

Next from the same sources: three dismissals silence a suggestion (OpenCode); pending suggestions are written to the ledger (Muse); the packet drops what a later refinement replaced (Typeless). Sources checked 2026-10-21.

## Beyond the browser

New senses, new ports, the same loop and ledger.

1. **Browser, now.** The extension, the harness and MCP.
2. **Any page, no install.** `tacit-web.js` is the same code with storage in the page. It runs the browser tests and the demo's `/try` today, and can grow into a hosted demo.
3. **Desktop.** A sense on the macOS accessibility API (focused window, selection, document URL) writes the same visits to the same ledger; the line moves to the menu bar.
4. **OS.** The harness becomes the context layer every app and agent reads from, and apps become tools.

## Open questions

- **The line at rest.** It sits over the bottom strip of the page. The next experiment: tuck it away while you read forward, and bring it back when you scroll up, reach the end, or it has something new to say.
- **Bubbles.** Folding can hide what you would have wanted to see. Today Tacit never folds on a guess, every fold shows its count, and folding stops on sites where you keep unfolding. That may not be enough.
- **Consensus.** An agent's guess about you must not quietly turn into something you agreed to. The ledger keeps "confirmed" and "executed" as separate states for that reason.
