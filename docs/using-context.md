# Using context

Tacit collects well: in a real session it knew the user was after "erwin hkust" (98%), that they typed it into Bing, which result they opened, what they selected and which passages held their eyes. Collecting is not the product. The product is the moment an agent already knows, without being told and without spending tokens the user did not want to spend. This note is about that moment: when context should reach an agent, through what, in what shape, and how the loop grows from one person's afternoon to months of reading and many agents.

## The cost of knowing

Every way of giving an agent context costs tokens, on every turn or only when used. Measured on this build (estimates; a token is about four characters):

| Mechanism | Paid | Cost |
|---|---|---|
| MCP tools (5 tools, their schemas and instructions), where an agent loads tools up front (Gemini CLI, OpenCode) | on every request, used or not | ~960 tokens |
| The same, where it loads them when needed (Claude Code, Codex, Cursor) | on every request: the names and the server's instructions | ~100 tokens |
| One line in the agent's instruction file pointing at `tacit` | on every request | under 50 tokens |
| `tacit` (the brief: page, goal, path, focus) | when the agent runs it | ~110 tokens |
| `tacit now --full` (the packet: what ⌥⇧C copies) | when the agent runs it | 200–750 tokens |
| A note added before every prompt | on every prompt | ~110 tokens × every prompt |
| A note added only when the prompt needs it | when relevant | ~110 tokens, plus a yes/no worth ~$0.00001 |

So where tools load up front, MCP costs twenty times a one-line pointer to a command, and a note in every prompt is the most wasteful option there is. Tacit takes the cheap end of each row:

- **The command, not the schema.** Any agent that can run a shell (Codex, Gemini CLI, OpenCode, Cursor, Aider, Claude Code) can run `tacit`. One line in its instruction file is all it carries until it needs more, and what it gets back is sized: a few lines by default, the packet when asked, one page in full when that is what the task needs.
- **A note only when the prompt needs one.** Before a prompt reaches the model, a hook asks `tacit brief`. Words that point at the screen ("this page", "what I'm reading", 这页, 刚才查的) decide for free. For the rest, while the user has been browsing in the last half hour, the running harness asks Jev one yes/no question: would this request be answered better knowing what the user has open? Jev answers in about half a second over a connection the harness keeps warm. Unsure, slow (over 2.5 s), or stale, and there is no note.
- **Fail closed.** A missing note costs the agent one call to `tacit`. A wrong note costs the user tokens, and attention, every time. Tacit errs toward silence.

This is Jev in the loop as TypeSafe means it: not the writer, the gate. A typed yes/no decides whether the expensive model hears about the screen at all.

## The aha moment

The aha is not "the agent can read my page". It is the agent answering a question the user never had to frame: "draft three questions for my meeting with him" and the agent knows who "him" is, because the user spent the last ten minutes on his profile. Three things have to be true for that to happen without waste:

1. The note arrives before the model reads the prompt (a hook), not after a round trip (a tool call the model has to think of).
2. It arrives only when the request builds on the screen, which a code check cannot always tell and a decision model can.
3. It is short and says where it came from, so the agent can trust it, quote it, and ask for more by name.

`tacit hook <agent>` does this for Claude Code, Codex, Gemini CLI and Cline, and a plugin does it for OpenCode. `bun run agents:check` runs each one installed against a stand-in model to show the note arrives, and only when it should. [agents.md](agents.md) has every agent.

## Agents, all of them

Nothing in Tacit is tied to one agent or one model. The harness keeps the ledger; every agent reaches it the same few ways:

| Way in | For | Standing cost |
|---|---|---|
| `tacit` on the command line | any agent with a shell, and people | under 50 tokens (one line of instructions) |
| MCP over stdio | agents that prefer structured tools | ~100 to ~960 tokens, by agent |
| A prompt hook running `tacit hook <agent>` | agents with hooks: the note arrives by itself | none until relevant |
| HTTP on 127.0.0.1, and `/v1/events` | programs, other harnesses | none |

Which model Tacit itself uses for its decisions is a separate choice, and also anyone's: Jev through TypeSafe or OpenRouter, a decision model in Ollama, any OpenAI-compatible server ([models.md](models.md)). Fully local is a configuration, not another harness: the agent on a model in Ollama (`ollama launch claude`, `codex`, `opencode`, `dsh` and more), and `TACIT_PRIVACY=local` so Tacit's own decisions stay there too. Nothing is then asked of anything off the machine.

## A packet that follows the person

⌥⇧C used to copy the same shape for everyone: intent, outline, passages. It now follows the person's line of thought, and reads each page for its kind:

1. What they are after, if Tacit is sure enough (below 35% it would mislead).
2. How they got here, and the path before it, oldest first, the way the thought went: "searched “hkust” (Bing) → read “Best Universities in Hong Kong” (1 min, 3 passages closely) → searched “erwin hkust”".
3. What they did on this page, in the order they did it: read closely, then selected, then copied.
4. The page, for its kind: a results page as its results, with the ones they opened marked; a feed as the posts about their goal; a page under ~300 tokens whole; a long page as the passages that answer them and its outline.

Two people on the same page get different packets because they came by different paths and looked at different things. That is the personalization worth having: it costs no settings, and it is true.

What is not done: learning which parts of a packet an agent actually used. That needs the agent-side loop below.

## Closing the loop on the agent's side

Today the loop closes only at the line: what the user keeps or undoes moves Tacit's thresholds. On the agent's side it is open: Tacit hands context over and never learns whether it helped. The signals are there to be had, all local:

- **A paste after a note** is the clearest failure: the user had to carry something Tacit did not.
- **A note the agent quotes** (it names the page or a passage) is a success; a note it ignores, a cost.
- **A `tacit now --full` right after a note** means the note was too thin for that kind of request.

These would tune the gate (how sure Jev must be), the note's size per kind of request, and which packet sections earn their place. The first step is to count them in the ledger, before tuning anything.

## Scaling up

Scale means three things here, in this order:

1. **Across agents (now).** The command, MCP, hooks and HTTP above. Each new agent is a few lines in [agents.md](agents.md) and, where it has hooks, one adapter in `daemon/hooks.ts`.
2. **Across time (next).** Months of history are not useful as pages. They become useful as threads: "preparing to meet Erwin Huang (HKUST CEI)", "choosing a vector database", each with its people, sources, the passages that mattered and where it stands. Threads are what an agent should read first (`tacit threads`), and what the user should be able to see, rename and delete. Building them is mostly code (clustering visits by shared terms, searches and time) with a model only to name and summarize, opt in, and local if the user asks.
3. **Across people (validation).** The office-hours question is still open: who needs this most, by name. The number to watch is pastes per day into an agent, before and after. Without a second real user, scaling the system is scaling a guess.

## Working together, at its best

What we hold Tacit to, so that a person and an agent work as one:

- The person never retypes what the screen already says, and the agent never asks what the trail already answers.
- Context arrives when the work needs it, not before and not always. Silence is the default.
- Every claim about the person says where it came from (a search, a selection, a passage read for twelve seconds), so they can correct it.
- Tacit proposes; the person decides; the agent writes. Nothing irreversible happens without a key or a click.
- The person's attention is the signal. Tacit follows it and never asks them to describe it.
- Cost is part of the design: tokens, latency and money have a budget at every layer, and the cheapest layer that can decide does.
- Local by default, and every destination named.

## A terminal, later

The command line is already the best way for an agent to use Tacit. For people it could become a place of its own, in the spirit of Mole or gstack: `tacit` in a terminal opening a calm full-screen view of the current thread, the trail and the library, with search as you type and one key to hand something to an agent. That is its own branch, after threads, since threads are what it would show.
