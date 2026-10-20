<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img src="docs/assets/logo.svg" width="72" height="72" alt="Tacit">
</picture>

# Tacit

**Your agent should already know what you're looking at.**

Tacit reads the page you're on and how you got there, keeps it on your machine,<br>
and hands it to Claude Code, Cursor or any MCP agent. No more Cmd+A, copy, paste.

[![CI](https://github.com/wujiajunhahah/tacit/actions/workflows/ci.yml/badge.svg)](https://github.com/wujiajunhahah/tacit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-17161c?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-5_tools-9ecd2e?style=flat-square&labelColor=17161c)](#for-agents-mcp)
[![Local first](https://img.shields.io/badge/your_data-stays_local-9ecd2e?style=flat-square&labelColor=17161c)](#privacy-and-security)
[![Bun](https://img.shields.io/badge/Bun-1.4-17161c?style=flat-square)](https://bun.sh)

**English** · [简体中文](README.zh-CN.md) · [Manifesto](MANIFESTO.md) · [Quick start](#quick-start) · [For agents](#for-agents-mcp)

<br>

<img src="docs/assets/demo.gif" width="880" alt="Search, open an article: Tacit's line says what is next and why. Jump to the answer, focus, hand the page to your agent, fold a feed, copy an install command. Everything lands in a local ledger.">

</div>

<br>

> We have the smartest tool humans have ever made.
>
> And every day, we use it for the dumbest thing: Cmd+A. Copy. Paste.
>
> I'm not using AI. I'm its human clipboard.
>
> <sub>From the [manifesto](MANIFESTO.md).</sub>

Every interface today is built for one kind of user: a person with a keyboard and a mouse. The agent sitting next to you sees nothing unless you carry the page to it.

Tacit is the missing context layer. It reads the page and the path that led you there, keeps both as a ledger on your machine, predicts what you need next with fast typed decisions, and lets any agent read the context directly. Input should approach zero.

## What it does

- **Senses.** Reads the page (main text, sections, links, code blocks) and how you arrived: the search you ran, the link you clicked, the tab it came from, what you selected or copied, how long you stayed.
- **Intent.** Infers what you are after, with the evidence behind it and a calibrated confidence. Anything you state outranks every inference.
- **Reflex.** Decides the next step: jump to the passage that answers you, copy the command you came for, open the link that matters, fold the posts that don't. A local engine runs offline; [TypeSafe's Jev](https://typesafe.ai) takes over when you add a key.
- **Surface.** One quiet line at the bottom of the page: what is next and where that came from ("from your search"). It acts when sure, suggests when close, and asks with choices instead of a text box when it isn't.
- **Handoff.** ⌥⇧C puts a compact context packet on your clipboard: intent, arrival, selection, the relevant passages, the outline. A few hundred tokens instead of the whole page.
- **Port.** An MCP server, so your agent reads what you are looking at, what you are trying to do, and everything you have read. No copy, no paste.
- **Ledger.** Everything stays on your machine. A local page shows your trail and every action Tacit took, as suggested → confirmed → executed → undone.

| | |
|---|---|
| ![Search, then the article: the line offers the jump](docs/screenshots/article-line.png) | ![The slip: intent, evidence and the next steps](docs/screenshots/article-slip.png) |
| ![A feed folded around what you searched](docs/screenshots/feed.png) | ![A repo: the line hands you the install command](docs/screenshots/repo.png) |
| ![No context yet: the line asks, with choices](docs/screenshots/ask.png) | ![The local ledger](docs/screenshots/ledger.png) |

## Quick start

You need [Bun](https://bun.sh) 1.4+ and Chrome or any Chromium browser.

```bash
git clone https://github.com/wujiajunhahah/tacit.git
cd tacit
bun install
bun run build
```

**1. Load the extension.** Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the `extension` folder. (Or unzip `tacit-extension-*.zip` from [Releases](https://github.com/wujiajunhahah/tacit/releases) and load that.) The line works on its own from here.

**2. Start the harness.** It keeps the ledger, answers decisions and serves the ledger UI at [127.0.0.1:7766](http://127.0.0.1:7766).

```bash
bun run harness
```

**3. Connect your agent.** From the repo folder:

```bash
claude mcp add tacit -- bun "$PWD/daemon/mcp.ts"
```

Then ask Claude Code *"what's the main argument of the page I'm reading?"* It calls `tacit_current_context` by itself.

**4. Try it without the open web.** An offline demo site (a search engine, a long article, a social feed, a code repo):

```bash
bun run demo
```

Open [127.0.0.1:7777](http://127.0.0.1:7777) and search "decision latency".

### Keys

| Key | Does |
|---|---|
| ⌥↵ | Run the top suggestion |
| ⌥1 ⌥2 ⌥3 | Run a specific suggestion |
| ⌥⇧C | Hand this page to your agent |
| ⌥⇧F | Focus on what matches |
| ⌥⇧Z | Undo the last action |
| Esc | Close the slip |

## For agents (MCP)

Five read-only tools over stdio, reading the same local ledger as the harness:

| Tool | Call it when the user says | Returns |
|---|---|---|
| `tacit_current_context` | "this page", "what I'm reading", "here" | The open page as a packet: intent, how they got here, selection, relevant passages, outline |
| `tacit_intent` | "help me with this", "what next" | The inferred goal, confidence, evidence, other readings |
| `tacit_trail` | "the article from before", "that docs page" | Recent visits, newest first, with how each was reached |
| `tacit_search` | "the post about rate limits", "我之前看的那篇" | Full-text search over pages read, English and Chinese |
| `tacit_page` | after a search or trail hit | The full readable text as markdown |

On the demo article the packet is **539 tokens; the page is 4,240.** Here is the start of one, as an agent receives it ([full example](docs/screenshots/agent-view.md)):

```markdown
# Context: tacit-labs/reflex: Calibrated reflexes for interfaces · Codeyard

**What I'm trying to do** (inferred · 91%): install reflex
- searched “install reflex” · just now

**How I got here:** searched “install reflex” → on “install reflex - Seek”
  → clicked “tacit-labs/reflex: Calibrated reflexes for interfaces”

## Most relevant on this page
### Install
bun add @tacit-labs/reflex
```

Cursor, Claude Desktop, Windsurf and other MCP clients take the same server:

```json
{
  "mcpServers": {
    "tacit": { "command": "bun", "args": ["/absolute/path/to/tacit/daemon/mcp.ts"] }
  }
}
```

## How it works

```mermaid
flowchart LR
  subgraph browser["Your browser"]
    page["the page"] --> cs["content script<br/>senses · the line"]
    cs <--> sw["service worker<br/>trail · arrival"]
  end
  sw -->|ingest · decide| harness["harness<br/>127.0.0.1:7766"]
  harness -.->|optional| jev["TypeSafe Jev"]
  harness --> ledger[("ledger<br/>~/.tacit/tacit.db")]
  harness --> ui["ledger UI"]
  ledger --> mcp["MCP server"]
  mcp --> agents["Claude Code · Cursor · any agent"]
```

Six layers, each a small module:

| Layer | Where | Job |
|---|---|---|
| Senses | `extension/src/extract`, `track.ts` | Page model, arrival, selections, copies, dwell |
| Ledger | `daemon/db.ts` | Visits, pages and actions in SQLite under `~/.tacit` |
| Intent | `core/intent.ts` | Evidence with time decay, candidates, calibrated confidence |
| Reflex | `core/decision.ts`, `core/jev.ts` | Choice, score and yes/no decisions with probabilities, local or Jev |
| Surface | `extension/src/surface` | The line, the slip, highlights, focus, folds |
| Port | `daemon/mcp.ts`, `core/packet.ts` | MCP tools and the handoff packet |

`core/` is plain TypeScript shared by the extension and the harness. The wire contract is [`core/protocol.ts`](core/protocol.ts).

### What Tacit asks Jev

On an article, one choice question: *given what the user is trying to do, which of these is the next thing they want?* The options are the page's best actions plus "none of these". On a feed, one yes/no per post: *is this post about what the user is trying to do right now?* Answers come back with probabilities; the line acts above 0.6 combined confidence, suggests above 0.35, and asks below.

```bash
TYPESAFE_API_KEY=... bun run harness
```

Any error, or no answer within 2.5 s, falls back to the local engine.

## Principles

These come from the [manifesto](MANIFESTO.md).

- **Interfaces can differ per person; semantics cannot.** Every action has an explicit state (suggested, confirmed, executed, undone) and lands in the ledger. Nothing executes without a keystroke or a click.
- **Act when sure, ask when not.** Thresholds are interface design, not model output.
- **Fold, never hide.** Every fold says why, shows a count, and comes back in one click. Personalisation should not quietly narrow what you can see or do.
- **Say where it came from.** Every prediction carries its provenance.
- **Local by default.** Nothing leaves the machine unless you turn on Jev, and then only decision requests.

## Privacy and security

The extension reads every page you visit, so it is built to stay out of the way and to keep what it sees to itself.

- **Page content goes to one place:** the harness on 127.0.0.1. No telemetry, no analytics, no cloud.
- **Some sites are skipped out of the box** (Gmail, Google accounts, PayPal, 1Password, Bitwarden, LastPass), and Tacit can be paused globally or per site from the popup.
- **The harness binds to loopback only**, rejects foreign `Host` headers (DNS rebinding), refuses requests from web-page origins, grants CORS only to the extension, and serves its UI under a nonce-based CSP.
- **The ledger is SQLite in `~/.tacit`**, readable only by you (0600 files in a 0700 folder). Delete the folder and it is gone.
- **Jev is opt-in.** With a TypeSafe key, each decision sends your inferred intent, its top evidence, the page's title and URL, and the candidates being judged (the labels and short snippets of the page's next steps, or up to 40 feed posts). The ledger itself never leaves.

The [privacy policy](PRIVACY.md) lists everything Tacit reads, where it goes, exactly what reaches Jev, and how to delete it. Found a hole? See [SECURITY.md](SECURITY.md).

## Status

A working prototype, built in a night and checked in a real browser: 90 unit tests, and a 30-step end-to-end run (real Chromium, the built extension, the demo site, the harness and an MCP client) on every push.

- [x] Extension: senses, intent, the line, focus, folds, handoff
- [x] Harness: local ledger, search in English and Chinese, ledger UI
- [x] MCP server with five tools
- [x] Jev decisions with a local fallback
- [ ] Chrome Web Store release
- [ ] Firefox and Safari
- [ ] Per-site rules and a privacy view in the popup
- [ ] Search that stays fast over months of history
- [ ] Context from PDFs, videos and local files
- [ ] Interfaces that grow out of intent: a table when you compare, a diagram when you try to understand

## Development

```bash
bun test            # unit tests: core, extension, harness
bun run typecheck   # tsc, strict
bun run e2e         # real Chromium + extension + demo site + harness + MCP
bun run record      # re-record docs/tacit-demo.mp4
```

```
core/        intent, ranking, decisions, the packet, the wire protocol
extension/   Chrome MV3 extension: senses and the line
daemon/      harness: SQLite ledger, HTTP API, ledger UI, MCP server
demo/        offline demo site: search, article, feed, repo
scripts/     build, e2e, recording, smoke test
test/        bun tests
```

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Wu JiaJun

<div align="center">
<br>
<sub>The best interaction is the least interaction.</sub>
</div>
