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
| Port | A note before a prompt that builds on the screen, the `tacit` command, the packet (⌥⇧C) and five read-only MCP tools hand any agent the same context. | `core/brief.ts`, `core/packet.ts`, `daemon/cli.ts`, `daemon/hooks.ts`, `daemon/mcp.ts` |

Every turn runs locally in milliseconds; Jev, when enabled, only refines it. Scaling up means more senses feeding the same ledger, not more UI.

## Who decides

Every decision in the loop has one owner. Prefer them in this order:

| Owner | Takes | Never takes |
|---|---|---|
| **Code** | Anything that follows from rules, or runs on every event: privacy, extraction, attention, intent, the gate, calibration, the packet. | |
| **Pre-written** | Everything people or models read: copy in both languages, the packet's structure, the questions put to a model, the setup prompt. | |
| **A small typed model** (Jev first, optional) | Judgments of meaning that must come back in about half a second as a typed answer: a choice, a score, a yes or no. | The final say: its answer goes through the gate. |
| **A chat model** (optional) | A second opinion on a choice the small model is unsure of, as the same typed answer. | Anything else. It never writes. |
| **A large model** (your own agent) | Open-ended work: explain, write, plan, act across tools. Only through the port, only when you ask. | Anything Tacit does on its own. |

You own everything irreversible or outward-facing.

| Decision | Owner | Budget | If it fails |
|---|---|---|---|
| Read this page at all? | Code, with your rules: pause, never-read list, private paths | < 1 ms | Do not read |
| What is on it, and what kind of page? | Code: article, feed, repository, search | < 30 ms | The generic reader |
| How did you get here? | Code: navigation events, the referrer | < 1 ms | "Unknown" |
| What counts as reading? | Code; thresholds pre-written, the pointer's yours | every 500 ms | Nothing counts |
| What are you after, and how sure? | Code: weights, decay, softmax | < 5 ms | Ask |
| Which step next, and which posts matter? | The chain, in one batched call (a choice, up to 40 yes/no): Jev, then a second decision model if Jev fails or is still silent at 800 ms; an unsure choice (confidence < 0.55) goes to a chat model once | 3.2 s for all of it; the local answer shows first | The local view stays |
| Which passages answer you? | Code: ranking against your words | < 5 ms | No marks |
| Act, suggest or ask? | Code: combined confidence against the calibrated thresholds | < 1 ms | Ask |
| What does the line say? | Pre-written copy, filled with your words and the page's | | |
| What does the agent get? | Code fills a pre-written packet; nothing is paraphrased | < 10 ms | The outline |
| Does this prompt need the screen? | Code, when its words point at the screen; otherwise, while you have been browsing in the last half hour, one yes or no from the chain | 2.5 s, before the prompt reaches the agent's model | No note |
| Did it work? | You: keep, undo, unfold | | |
| Should the bar move? | Code: calibration, explained in the dashboard | < 5 ms | The defaults |
| What to do with the context? | Your agent's model, through the note, `tacit` or MCP | the agent's | |

Per decision: one batched call to the first model that answers, and for an unsure choice one more, to a chat model. No model writes anything. Everything else is code you can read and test.

**Branches.** No harness: the extension works alone. No key: the code engine, on this machine. An error or a slow model: the next one, then the view already on screen. Kept local: only engines on this machine. A `models.json` that cannot be used: the code engine, and the dashboard says why. Unsure: ask, with choices. An unfamiliar machine at setup: your agent, with a pre-written prompt, while a script does the deterministic steps.

**Adding a model.** It answers the same three typed questions, through TypeSafe's System One API or, for a chat model, a strict JSON schema; fits the budget; and sees no more than a decision request carries ([PRIVACY.md](PRIVACY.md) lists it). `bun run models --try` checks it against Tacit's own questions before it joins the chain ([docs/models.md](docs/models.md)). A large model never joins the loop; it stays behind the port.

## Jev in the loop

Jev is a System One model: typed questions in, probabilities out, never text. TypeSafe's advice is to put it inside a loop for the fast, typed calls, routing and guardrails, and never to make it the loop's writer. That is Tacit's split: Jev judges, code gates, you decide, your agent writes.

What Tacit takes from TypeSafe and OpenRouter, checked 2026-10-21:

- **One API, many servers.** TypeSafe's `POST /v1/systemone` is also served by OpenRouter, and by Ollama, LM Studio, llama.cpp and vLLM for decision models. Tacit speaks it once; the base URL picks the server.
- **A cascade with a verifier.** Cheap and fast first, and a stronger model only where the first is unsure, as in FrugalGPT and OpenRouter's Jev-verified cascade. Tacit's version: the second opinion is kept only if it is surer, and it never runs for yes/no batches, where forty posts are a cost, not a doubt.
- **Hedged, not queued.** A model still silent at 800 ms has a bad moment; the next one starts alongside it and the first answer wins. Past 3.2 s the view on screen stays. A slow network never holds the page.
- **One confidence.** `(p_max - 1/n) / (1 - 1/n)`, TypeSafe's definition, for every engine, so a threshold means the same with three options or twelve. A chat model's probabilities are its own say-so, so 15% of them is spread evenly first.
- **Pinned.** TypeSafe advises pinning a model once thresholds are tuned; OpenRouter, re-tuning them per model. Tacit pins `typesafe/jev-1.14` and leaves the alias as an option.
- **Private by request.** Through OpenRouter every request asks for zero data retention and no training on what it sends.

Measured with `bun run models --try` on five questions with clear answers, through a proxy: Jev 1.14 10/10 at 488 ms median; Inception's mercury-decide 10/10 at 608 ms; Gemini 3.1 Flash Lite 10/10 at 1,187 ms for seventeen times Jev's price; the code engine 6/10; Together's tev1 0.8B, in Ollama on this machine, 5/10 at 166 ms. A local model has to earn its place, and `--try` says when one does not. Kept local, with a cloud key set and every outbound request sent through a proxy that records and refuses, five questions and five real sites made no attempt to leave the machine. Through the proxy a new TLS connection took 0.1 to 6 s, so the harness keeps one warm while you browse.

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
- **"None of these."** On a Chinese article read for an English search, Jev said nothing on the page fit, and the line still offered the second best: a jump to the references. Now "none" means no step, the line says what you are after, and section numbers and footnote marks (`4.1`, `[12]`) are never candidates.
- **Word boundaries in Chinese.** References, comments and "see also" were meant to rank low, but the pattern ended in `\b`, which knows only ASCII, so 参考文献 never matched, and a Chinese article's English citations outranked its text. The pattern now ends on "no letter or digit next", and those sections are never jump targets.
- **A floor that knew less.** When every model failed, the harness's code engine answered and its answer replaced the extension's richer ranking. The extension now keeps what it showed.
- **Cold connections.** The first decision after a quiet spell paid for a TLS handshake that took up to 6 s through a proxy. The harness opens the connection while you browse, with a bare `HEAD`, at most once a minute.
- **Dead connections.** After a night of sleep, every decision timed out until the harness restarted: pooled connections had died while still looking open, and Bun drops one only after a request has waited out its timeout on it. A heartbeat now notices the sleep (a beat far later than asked); then, and after any timeout, requests go out on fresh connections for a minute while a few bare `HEAD`s at once drain the pool.
- **Steps that go nowhere.** On a real university site the line offered "About" on the About page, and "Admissions", which the site's menu kept for itself; Tacit said it ran them and nothing moved, six times. A link to the current page, or one the page marks as current, is never a step now, and a click that does not start to leave the page within 0.7 s is followed by its address.
- **Search pages.** Bing's results read as nothing: an empty read of a redirect replaced the real one, and a page with no body yet stopped the reader. Results are now read as results, a linked heading and the longest text in the box that holds that one result, which fits Bing, Google, Baidu and DuckDuckGo alike; an empty read never replaces a full one.
- **A site's own name.** With "hkust" as the intent, every link on hkust.edu.hk matched it. Words that only name the site, from its address and its titles, are set aside on that site, so "erwin hkust" still finds Erwin there.

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

**Every harness, now.** Tacit is a context engine, not another agent. Claude Code, Codex, Gemini CLI and OpenCode get a note before a prompt that builds on the screen, through their prompt hooks or a plugin; any agent with a shell runs `tacit`; Cursor, OpenClaw and every other MCP client read the tools; any program that holds the token follows `/v1/events` ([docs/agents.md](docs/agents.md)). When context is worth its tokens is its own design: [docs/using-context.md](docs/using-context.md). Next, in this order: an OpenClaw plugin that adds the note before a prompt is built (`before_prompt_build`); threads, so months of reading become what an agent reads first; and work that may take longer than a decision, such as distilling what you read this week into what an agent should remember, done only when you ask and only by a model you chose.

## Open questions

- **The line at rest.** It sits over the bottom strip of the page. The next experiment: tuck it away while you read forward, and bring it back when you scroll up, reach the end, or it has something new to say.
- **Bubbles.** Folding can hide what you would have wanted to see. Today Tacit never folds on a guess, every fold shows its count, and folding stops on sites where you keep unfolding. That may not be enough.
- **Consensus.** An agent's guess about you must not quietly turn into something you agreed to. The ledger keeps "confirmed" and "executed" as separate states for that reason.
- **Thresholds per model.** On the same question, Jev put 0.48 on the answer that mercury-decide put 0.88 on. Calibration moves one bar from your undos; it may need one per model.
- **"None" as its own question.** TypeSafe warns that a "none of the above" option may not work well and suggests a separate yes/no. Tacit keeps it as an option for now, because the code engine needs it there; the trade is worth measuring on real pages.
