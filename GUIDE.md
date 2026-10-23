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

The agent gets the code, builds it, connects itself and the other agents it finds, starts the harness and checks that it all works. It asks you for one thing only a person can do: loading the extension in Chrome. If your agent cannot open links, paste the [whole prompt](docs/agent-setup.md) instead.

## Or by hand

1. `bun install && bun run setup`: builds everything, checks it, and connects the agents you have: Claude Code, Codex, Gemini CLI, OpenCode, Cursor, OpenClaw. It asks before it changes anything outside the folder.
2. Load the extension: open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, pick the `extension` folder.
3. `bun run harness`, and keep it running. It keeps your ledger and serves the dashboard at [127.0.0.1:7766](http://127.0.0.1:7766). To have it start at login and stay up instead: `bun run service install`.
4. `bun run pair`: opens a page in your browser that pairs the extension with the harness. Until then the harness shares nothing with it.
5. Optional: `bun run keys set openrouter`, to let Jev decide (below).

## What to try

| Do this | And see |
|---|---|
| Search for anything, open a result | The line: the next step, and where it came from ("from your search") |
| Press ⌥↵ | It takes you there. The line says "Jumped to … · Undo" |
| Press ⌥⇧C | The page on your clipboard as context for an agent: a few hundred tokens, not the whole page |
| Open a long feed, or X | Posts unrelated to what you are after fold away: "Folded 7 posts · show" |
| Read a passage for a few seconds | It joins your context. Hover the line: "Read closely: 1 passage" |
| Open a page with nothing to go on | "Looking for…", with three choices on ⌥1–3 |
| Ask your agent "what's the main point of the page I'm reading?" | It already has a note about the page, or reads it through Tacit, and answers. Nothing to paste |
| Ask it something that has nothing to do with the page | No note, no tokens spent on your screen |
| Run `tacit` in a terminal (`bun run tacit` in the folder) | What you have open, what you seem to be after, how you got there, in a few lines |
| Open [127.0.0.1:7766](http://127.0.0.1:7766) | Your context library: every page, what you read closely, how you got there |

The demo site at [127.0.0.1:7777](http://127.0.0.1:7777) has a search engine, an essay, a feed, an X-style timeline and a code repository to try all of this on, offline.

**Keys.** ⌥↵ runs the first suggestion. ⌥1–3 runs another, or picks a choice when Tacit asks; with the slip open, 1–3 alone does. The digits are the row above the letters, so any laptop has them. ⌥⇧C copies the page for your agent, ⌥⇧F focuses on what matches, ⌥⇧Z undoes, Esc closes. Hold ⌥ to see them.

## Models and keys

- **No model is needed.** Out of the box Tacit decides in code, on this machine, with no key and no network.
- **Let Jev decide.** [Jev](https://typesafe.ai) is a small, fast decision model, and sharper than code on hard pages. With an [OpenRouter](https://openrouter.ai) key, run `bun run keys set openrouter`: Jev leads, a second decision model from another company backs it up, and a chat model settles the choices Jev is unsure of. A TypeSafe key works too: `bun run keys set typesafe`. A decision costs about $0.00002. Where OpenRouter needs a proxy, a DeepSeek key works without one: `bun run keys set deepseek`.
- **Check it:** `bun run models` says who decides; `bun run models --try` asks each engine five questions with clear answers and shows what it got right, how fast, and what it cost.
- **Keep it on this machine:** `ollama pull tev1` (4.6 GB), then `TACIT_PRIVACY=local bun run harness`. Only engines on this machine are asked, even with a cloud key set. A local model has to earn its place: the 0.8B `tev1:0.8b` did worse than code on Tacit's samples, and `bun run models --try` tells you how yours does.
- **Any other server** that speaks TypeSafe's decision API or OpenAI's chat API, local or not, goes in `~/.tacit/models.json`: [docs/models.md](docs/models.md).
- **Your agent brings its own model.** Tacit gives it context, through a note before a prompt that needs it, the `tacit` command or MCP, and never calls a large model to write anything, so there is nothing else to configure or pay for. Any agent works: [docs/agents.md](docs/agents.md).
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
| The popup says "Not paired with the harness" | Run `bun run pair` in the tacit folder; it opens the pairing page in your browser. |
| Decisions never come from Jev | `bun run models --try` says which engine fails and why. Behind a proxy, start the harness from a shell that has it, or reinstall the service from one: `bun run service install`. |
| Your agent cannot see Tacit | Run `bun run setup` again, then restart the agent. In Claude Code, `claude mcp list` should show `tacit`. In Codex, trust Tacit's hook in `/hooks`. `bun run agents:check` shows whether each agent gets the note. |
| The line guesses wrong | Select the words you care about, or search again: what you do next outweighs what came before. When Tacit is unsure, it asks instead of guessing. |

## Tell someone

```text
Tacit reads the page you're on and how you got there, and hands it to your AI agent, so you stop copy-pasting pages into chats. Local and open source: https://github.com/wujiajunhahah/tacit

To set it up, paste this to your coding agent: "Set up Tacit on this computer. Read https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md and follow it step by step. Ask me only where it says so."
```
