English · [简体中文](GUIDE.zh-CN.md)

# How to use Tacit

Tacit reads the page you are on and how you got there, and hands it to your agent, so you stop pasting pages into chats. This page covers trying it, setting it up, using it, and telling someone else.

## Try it in a minute

No extension, no account, no key. You need [Bun](https://bun.sh) 1.4 or later.

```bash
git clone https://github.com/wujiajunhahah/tacit.git && cd tacit
bun install && bun run build && bun run demo
```

Open [127.0.0.1:7777/try](http://127.0.0.1:7777/try), search "decision latency", and open the first result. The line at the bottom of the page is Tacit. `/try/off` turns it off again.

## Set it up with your agent

Paste this into Claude Code, Cursor, Codex or any coding agent:

```text
Set up Tacit on this computer. Read https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md and follow it step by step. Ask me only where it says so.
```

The agent gets the code, builds it, connects itself over MCP, starts the harness and checks that it all works. It asks you for one thing only a person can do: loading the extension in Chrome. If your agent cannot open links, paste the [whole prompt](docs/agent-setup.md) instead.

## Or by hand

1. `bun install && bun run setup`: builds everything, checks it, and connects Claude Code if you have it. It asks before it changes anything outside the folder.
2. Load the extension: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, pick the `extension` folder.
3. `bun run harness`, and keep it running. It keeps your ledger and serves the dashboard at [127.0.0.1:7766](http://127.0.0.1:7766).

## What to try

| Do this | And see |
|---|---|
| Search for anything, open a result | The line: the next step, and where it came from ("from your search") |
| Press ⌥↵ | It takes you there. The line says "Jumped to … · Undo" |
| Press ⌥⇧C | The page on your clipboard as context for an agent: a few hundred tokens, not the whole page |
| Open a long feed, or X | Posts unrelated to what you are after fold away: "Folded 7 posts · show" |
| Read a passage for a few seconds | It joins your context. Hover the line: "Read closely: 1 passage" |
| Open a page with nothing to go on | "Looking for…", with three choices on ⌥1–3 |
| Ask your agent "what's the main point of the page I'm reading?" | It reads the page through Tacit and answers. Nothing to paste |
| Open [127.0.0.1:7766](http://127.0.0.1:7766) | Your context library: every page, what you read closely, how you got there |

The demo site at [127.0.0.1:7777](http://127.0.0.1:7777) has a search engine, an essay, a feed, an X-style timeline and a code repository to try all of this on, offline.

**Keys.** ⌥↵ runs the first suggestion. ⌥1–3 runs another, or picks a choice when Tacit asks. ⌥⇧C copies the page for your agent, ⌥⇧F focuses on what matches, ⌥⇧Z undoes, Esc closes. Hold ⌥ to see them.

## Models and keys

- **No model is needed.** Out of the box Tacit decides in code, on this machine, with no key and no network.
- **Optional: TypeSafe's [Jev](https://typesafe.ai)**, a small, fast decision model, for sharper choices on hard pages. Start the harness with your key: `TYPESAFE_API_KEY=… bun run harness`. `TYPESAFE_MODEL` (default `jev-latest`) and `TYPESAFE_BASE_URL` are optional. If Jev has not answered within 2.5 s, the local engine's answer stands.
- **Your agent brings its own model.** Tacit gives it context over MCP and never calls a large model itself, so there is nothing else to configure or pay for.
- **Nothing to tune.** Tacit moves its own bar from what you keep and undo; the dashboard's Learned view says what changed. The one setting is yours: how long the pointer has to rest before a passage counts.

Which decisions are code, which are written in advance and which a model makes: [DESIGN.md](DESIGN.md#who-decides).

## Your privacy, in your hands

- Pause Tacit everywhere or on one site from the popup. The never-read list takes sites and paths; password managers, Gmail and X messages are on it from the start.
- Delete one page, or everything, in the dashboard. The extension forgets it too.
- Everything Tacit reads and where it goes is in [PRIVACY.md](PRIVACY.md).

## When something is off

| Symptom | Try |
|---|---|
| No line on a page | It may be paused, on the never-read list, or not an `http(s)` page. The popup says which. |
| The popup says "Harness offline" | Run `bun run harness` in the tacit folder. If it is running, your system proxy may not exempt `127.0.0.1`; add it to the proxy's bypass list. |
| Your agent cannot see Tacit | Run `bun run setup` again, then restart the agent. In Claude Code, `claude mcp list` should show `tacit`. |
| The line guesses wrong | Select the words you care about, or search again: what you do next outweighs what came before. When Tacit is unsure, it asks instead of guessing. |

## Tell someone

```text
Tacit reads the page you're on and how you got there, and hands it to your AI agent, so you stop copy-pasting pages into chats. Local and open source: https://github.com/wujiajunhahah/tacit

To set it up, paste this to your coding agent: "Set up Tacit on this computer. Read https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md and follow it step by step. Ask me only where it says so."
```
