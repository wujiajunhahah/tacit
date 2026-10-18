# Changelog

## 0.1.0 · 2026-10-18

First public release.

- **Extension** (Chrome MV3): reads the page and how you got there, and draws one line at the bottom of every page. Jump to the answer, focus, fold a feed around your intent, copy the command you came for, and hand the page to your agent with ⌥⇧C. When unsure, it asks with choices.
- **Intent**: inferred from searches, selections, copies, clicks and dwell, with evidence and a calibrated confidence. Anything you state outranks inference.
- **Decisions**: a local engine offline; TypeSafe's Jev with a key, falling back to local on any error or timeout.
- **Harness**: a SQLite ledger in `~/.tacit`, an HTTP API on 127.0.0.1:7766, search over everything read (English and Chinese), and a ledger UI.
- **MCP server** with five tools: `tacit_current_context`, `tacit_intent`, `tacit_trail`, `tacit_search`, `tacit_page`.
- An offline demo site, 90 unit tests and a 30-step end-to-end run in real Chromium.
