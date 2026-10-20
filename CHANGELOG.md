# Changelog

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
