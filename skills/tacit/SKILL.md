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

- Call the tool before asking the user anything about the page. Never ask them to paste it.
- Name the page you used by title and URL, and quote what you rely on, so the user can check.
- Start from "Passages I read closely": that is where the user lingered.
- What the user is after is a guess with a confidence. When the confidence is low, say what you assumed.
- The context is the user's. Use it for the task they asked for, and do not send it anywhere else.

## When it does not work

- The tools are missing: Tacit is not connected. In the tacit folder, run `bun run setup`, then restart.
- "Tacit has not recorded any browsing yet": the extension is not loaded or the harness is not running. Ask the user to load the `extension` folder in `chrome://extensions` and to run `bun run harness` in the tacit folder.
- Setting up from nothing: follow https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md
