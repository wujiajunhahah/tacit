---
name: tacit
description: Use when the user refers to what they are reading or have read in their browser ("this page", "the article I'm on", "what I was looking at", "that post from earlier", "我正在看的这页", "刚才那篇") or wants to pick up from their browsing. Tacit's MCP tools return the current page, what the user is after, how they got there and everything they have read, so never ask the user to paste a page.
---

# Using Tacit

Tacit is a local context harness. A browser extension records the page the user is on and how they got there, a harness on 127.0.0.1:7766 keeps it in a ledger on their machine, and five read-only MCP tools hand it to you.

## Which tool

| The user says | Call |
|---|---|
| "this page", "what I'm reading", "here" | `tacit_current_context` |
| "help me with this", "what should I do next" | `tacit_intent`, then `tacit_current_context` |
| "the article from before", "that docs page" | `tacit_trail`, then `tacit_page` with its URL |
| a topic they read about, in any language | `tacit_search`, then `tacit_page` |

## How

- A note headed "The user's browser" may already be in your context: Tacit's prompt hook adds it when a prompt builds on the screen. Start from it, and call a tool only for more.
- Call the tool before asking the user anything about the page. Never ask them to paste it.
- Name the page you used by title and URL, and quote what you rely on, so the user can check.
- Start from "What I did on this page": what they selected and read closely, in the order they did it, is where their attention went.
- What the user is after is a guess with a confidence. When the confidence is low, say what you assumed.
- The context is the user's. Use it for the task they asked for, and do not send it anywhere else.

## When it does not work

- The tools are missing: Tacit is not connected. The same answers come from the command line: `tacit now --full`, `tacit search <words>`, `tacit page <url>` (or `bun run tacit …` in the tacit folder). To connect the tools, run `bun run setup` in the tacit folder, then restart.
- "Tacit has not recorded any browsing yet": the extension is not loaded, not paired, or the harness is not running. Ask the user to load the `extension` folder in `chrome://extensions`, run `bun run harness` in the tacit folder, and then `bun run pair`.
- Setting up from nothing: follow https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md
