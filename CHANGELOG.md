# Changelog

## 0.2.0 · Unreleased

What you read becomes context, X works for real, and Tacit learns from what you undo.

- **Reading attention.** A passage that holds the middle of the screen for 4 s of reading becomes context: it weighs the words you are after and leads the packet under "Passages I read closely". Turn on "Read with the pointer" in the popup and the passage your pointer rests on counts too, after a threshold you set (0.6–4 s). Skimming, idle time and hidden tabs never count.
- **X, for real.** Timelines that recycle posts keep every post you scroll past. Re-rendered posts get their folds back before they paint, and new posts are folded before they reach the screen. Opening a post is a new visit that remembers which post you came from. Conversations are never folded, and X messages and chats are never read.
- **Calibration.** Tacit raises its bar where you undo what it does, lowers it where you rarely do (0.5–0.8), and stops folding on sites where you keep opening folds. Opening any fold now counts. The dashboard's Learned view says what changed and why.
- **The dashboard** at 127.0.0.1:7766 becomes a context library: Now; Library, searchable in any language, by site or by what you read most; a page for every page, with what you read closely and how you got there; Trail; Learned; Connect, with the exact MCP command for your machine; and Privacy.
- **Deleting means everywhere.** Delete a page, or everything, in the dashboard, and the extension forgets it too; a stale copy can never bring it back. The harness remembers a deletion by a hash of the address, never the address.
- **English and 简体中文.** The line, the slip, the popup and the dashboard follow your browser's language, or the one you pick. Chinese intents are set upright, never in synthetic italics.
- **Calmer surfaces.** Confirmations ("Jumped to … · Undo") show in the line itself; the dark toast above it is gone. Once a step runs, the line moves on to the next one. Open, the line becomes the slip's header, your intent and where it came from, so nothing is said twice, and the slip is solid paper. When Tacit asks, it says "Looking for…" and offers three choices on ⌥1–3; picking a section takes you there in one step. ⌥⇧C has one name everywhere: Copy for agent. The dashboard sets times and counts in the sans with tabular figures and drops the confidence bar.
- **Natural Chinese.** 上下文 instead of "context" in the interface, 用鼠标跟着读 for pointer reading, and 停在屏幕上 where the old wording suggested eye tracking.
- **Try it with nothing installed.** The demo site's `/try` runs Tacit as a page script, the same code as the extension, with storage in the page; `/x/home` is a timeline that recycles posts the way X does.
- **[DESIGN.md](DESIGN.md):** the north star (less input), the principles, the loop, every signal and its weight, and when Tacit borrows from other tools.
- **Fewer permissions.** No `tabs` permission, and host access narrowed from `<all_urls>` to `http` and `https`.
- **Jumps land like anchor links:** the target near the top, the answer below it in the reading band, instead of centered under the previous section.
- **Fixes.** Clicking a fold no longer counts as interest in the posts it hides. Unfolding opens the whole run, even where the page recycled part of it. The popup hides the site switch on browser pages. The Learned view no longer says Tacit acts on its own: it offers, one key away. Reading a passage weighs its words but no longer renames your goal after a sentence you copied from it. A 40% undo rate moves the bar one step, not two (float rounding). The setup command adds Tacit to Claude Code for every project (`--scope user`), not only the tacit folder.
- **Tests.** 135 unit tests. The extension's end-to-end run grows to 41 checks (reading, pointer reading, Chinese, every dashboard view, a deletion reaching the extension), and `bun run e2e:web` checks the page runtime against an X-style virtual timeline (20 checks). Browser tests ignore any system proxy, so they run where one is set.

## 0.1.1 · 2026-10-21

Ready for the Chrome Web Store, and plain about what happens to your data.

- **Privacy policy.** [PRIVACY.md](PRIVACY.md) lists everything Tacit reads, where it goes, exactly what reaches Jev and how to delete it. The README links to it.
- **Chrome Web Store kit** in `docs/store`: listing copy in English and 简体中文, permission and data-use justifications, five screenshots, the promo tile and the store icon, re-rendered with `bun run store`.
- **"Local by default."** The extension and the popup no longer say everything stays on your machine, because Jev, when you turn it on, sends decision requests to TypeSafe. The README now describes those requests precisely: next-step labels with short snippets, or up to 40 feed posts.
- Playwright 1.64.1 and actions/checkout 7.

## 0.1.0 · 2026-10-18

First public release.

- **Extension** (Chrome MV3): reads the page and how you got there, and draws one line at the bottom of every page. Jump to the answer, focus, fold a feed around your intent, copy the command you came for, and hand the page to your agent with ⌥⇧C. When unsure, it asks with choices.
- **Intent**: inferred from searches, selections, copies, clicks and dwell, with evidence and a calibrated confidence. Anything you state outranks inference.
- **Decisions**: a local engine offline; TypeSafe's Jev with a key, falling back to local on any error or timeout.
- **Harness**: a SQLite ledger in `~/.tacit`, an HTTP API on 127.0.0.1:7766, search over everything read (English and Chinese), and a ledger UI.
- **MCP server** with five tools: `tacit_current_context`, `tacit_intent`, `tacit_trail`, `tacit_search`, `tacit_page`.
- An offline demo site, 90 unit tests and a 30-step end-to-end run in real Chromium.
