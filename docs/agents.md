# Tacit in every agent

Nothing in Tacit belongs to one agent or one model. The harness keeps the ledger on this machine. Any agent reaches it three ways, cheapest first:

1. **A prompt hook.** Before a prompt reaches the agent's model, the hook asks `tacit hook <agent>` whether the prompt builds on what the user has open. Only then does the agent get a short note, about 100 tokens: the page, what the user is after, how they got there. Otherwise it gets nothing, and the hook costs nothing.
2. **The `tacit` command, and one line in the agent's instructions.** Any agent with a shell can run `tacit`. The line, under 50 tokens a request, tells the agent the command is there. Then it pulls more only when it needs to: `tacit now --full`, `tacit search <words>`, `tacit page <url>`.
3. **MCP.** Five read-only tools, for agents that prefer tools. Agents that load tools only when needed (Claude Code, Codex, Cursor) carry little until then. The others carry about 1,000 tokens on every request.

`bun run setup` does what suits each agent it finds, after a yes. It keeps the first version of every file it changes next to it, as `<file>.before-tacit`. `bun run agents:check` runs each agent installed here once, the way setup connects it, against a stand-in model on this machine and a throwaway ledger. It checks that the note reaches the model for a prompt about the page, and stays away from one that is not about it:

```
✓ Claude Code 2.1.296      note for “what is this page about?”: yes · none for “write a haiku about rain”: yes · 1.3 s
✓ Codex 0.160.1            note for “what is this page about?”: yes · none for “write a haiku about rain”: yes · 14.1 s
✓ Gemini CLI 0.63.0        note for “what is this page about?”: yes · none for “write a haiku about rain”: yes · 2.7 s
✓ OpenCode 1.18.35         note for “what is this page about?”: yes · none for “write a haiku about rain”: yes · 8.0 s
```

## At a glance

| Agent | Prompt hook | Instructions | MCP |
|---|---|---|---|
| Claude Code | `UserPromptSubmit`, setup | the Tacit skill, setup | setup |
| Codex | `UserPromptSubmit`, setup (trust it once in `/hooks`) | `~/.codex/AGENTS.md`, setup | `codex mcp add` |
| Gemini CLI | `BeforeAgent`, setup | `~/.gemini/GEMINI.md`, setup | `gemini mcp add -s user` |
| OpenCode | a plugin, setup | `~/.config/opencode/AGENTS.md`, setup | `opencode.json` |
| Cursor | none can add to a prompt | its rules, by hand | `~/.cursor/mcp.json`, setup |
| OpenClaw | a plugin (`before_prompt_build`), by hand | `~/.openclaw/workspace/AGENTS.md` | `openclaw mcp set`, setup |
| DeepSeek Harness | its Claude Code hooks bridge | `~/.dsh/AGENTS.md` or `~/.agents/AGENTS.md` | `dsh-mcp-client` |
| Cline | a `UserPromptSubmit` script | its rules | its MCP settings |
| Windsurf, Zed, Goose | none can add to a prompt | their rules files | their MCP config |
| Aider | none | a file passed with `--read` | none: `/run tacit` |

"setup" means `bun run setup` writes it. "By hand" means the snippets below do it.

In the snippets, `bun` and `/path/to/tacit` stand for the absolute paths on your machine. `bun run setup` prints them, and the dashboard's Connect page has them ready to copy. Use absolute paths in hooks and MCP configs: agents run them without your shell's PATH. In an agent's instructions, plain `tacit` works once `bun link` (in the tacit folder) has put it on PATH.

## The line

```markdown
`tacit` prints what the user has open in their browser and what they are after: run it instead of asking them to paste a page, and `tacit help` for more. <!-- tacit -->
```

The comment at the end lets setup find the line again to update it. It costs a few tokens.

## Claude Code

`bun run setup` adds the MCP server for every project (`claude mcp add --scope user tacit -- bun /path/to/tacit/daemon/mcp.ts`), the skill (`~/.claude/skills/tacit/SKILL.md`), and the hook in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "bun /path/to/tacit/daemon/cli.ts hook claude", "timeout": 10 }] }
    ]
  }
}
```

The note arrives as "UserPromptSubmit hook additional context". Claude Code runs on other models too: `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` for DeepSeek, or `ollama launch claude` for a model on this machine. The hook and the tools stay the same.

## Codex

The hook goes in `~/.codex/hooks.json`, with the same shape as Claude Code's and `hook codex`. Codex runs a new hook only once the user trusts it: open Codex and trust it in `/hooks`. The line goes in `~/.codex/AGENTS.md`. The note arrives as a developer message after the prompt. `CODEX_HOME` moves all of this, and setup follows it.

Codex runs commands in a sandbox that may forbid writing to `~/.tacit` and connecting to `127.0.0.1`. `tacit` only reads the ledger and opens it read-only, so it works there. `tacit status` says when the harness cannot be reached from inside. Hooks run outside the sandbox.

For tools instead: `codex mcp add tacit -- bun /path/to/tacit/daemon/mcp.ts`. For a model on this machine: `codex --oss --local-provider ollama`, or `ollama launch codex`.

## Gemini CLI

In `~/.gemini/settings.json` (the timeout is in milliseconds):

```json
{
  "hooks": {
    "BeforeAgent": [
      { "hooks": [{ "type": "command", "command": "bun /path/to/tacit/daemon/cli.ts hook gemini", "timeout": 10000 }] }
    ]
  }
}
```

Gemini CLI reads a hook's output as JSON, so `tacit hook gemini` prints `{}` when there is no note. The note is appended to the prompt for that turn. The line goes in `~/.gemini/GEMINI.md`. Gemini CLI loads every MCP tool up front, so the line is the cheaper way in. For tools anyway: `gemini mcp add -s user tacit bun /path/to/tacit/daemon/mcp.ts`. Without `-s user` the server lands in the current project only. A `settings.json` with comments in it is not plain JSON, and setup leaves it alone and says so.

## OpenCode

OpenCode has no hook that runs a command. Its plugins see each message before it is stored. Setup writes `~/.config/opencode/plugins/tacit.ts`, two lines that load `daemon/opencode.ts` from your checkout. When `tacit brief` says yes, the plugin adds the note to the message as a part the user does not see. The line goes in `~/.config/opencode/AGENTS.md`.

For tools, in `opencode.json`: `"mcp": { "tacit": { "type": "local", "command": ["bun", "/path/to/tacit/daemon/mcp.ts"] } }`. OpenCode runs on DeepSeek, or on Ollama with `ollama launch opencode`.

## Cursor

Cursor's hooks can allow or block a prompt, but none can add to one. `sessionStart` adds context once a session, before there is a prompt to judge. So Cursor gets the tools: setup adds `tacit` to `~/.cursor/mcp.json` and leaves every other server as it was. The Cursor editor reads a tool's details only when it needs them. For the line, use a project rule or the project's `AGENTS.md`. Cursor keeps its global rules in its settings, not in a file.

## OpenClaw

Setup adds the server with `openclaw mcp set tacit '{"command":"bun","args":["/path/to/tacit/daemon/mcp.ts"]}'`. While OpenClaw's Gateway runs, use the Control UI instead: Settings → MCP. Its agents see the tools as `tacit__*`. A plugin can add the note before each prompt (`api.on("before_prompt_build")` returning `prependContext`, when `allowPromptInjection` is on). Setup does not write one yet.

## DeepSeek Harness

DeepSeek's own agent (`dsh`, in developer preview) is built from plugins, mounted through a Cordis patch file (`$DSH_HOME/cordis.patch.yml` for every profile). Tools:

```yaml
- insert:
    - id: tacit
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: tacit
        transport: stdio
        command: /path/to/bun
        args: ['/path/to/tacit/daemon/mcp.ts']
```

Its Claude Code bridge (`@deepseek-ai/dsh-hooks-claude-code`, experimental, `configPath` pointing at a file with the Claude Code hook above) runs `tacit hook claude` as it is. It reads instructions from `~/.dsh/AGENTS.md`, then `~/.agents/AGENTS.md`. Not tried here: dsh is not installed on this machine.

## Cline

A hook is an executable file named after its event. For every workspace, that is `~/Documents/Cline/Hooks/UserPromptSubmit`:

```sh
#!/bin/sh
exec bun /path/to/tacit/daemon/cli.ts hook cline
```

Turn on hooks in Cline's settings. `tacit hook cline` reads `userPromptSubmit.prompt` and always answers `{"cancel": false}`, with the note as `contextModification` when there is one. Cline's hooks do not run on Windows. Not tried here.

## The rest

- **Windsurf (Devin Desktop), Zed, Goose:** no hook can add to a prompt. Use the line in their rules (`global_rules.md`, `~/.config/zed/AGENTS.md`, `.goosehints`) and the MCP server in their config.
- **Aider:** no MCP. Pass a file with the line using `--read`, or run `/run tacit` in a chat.
- **Anything else:** a program holding the harness's token can call `POST /v1/brief` with `{"prompt": "…"}` for the same answer the hooks get. It can also follow `/v1/events`.

## Models: the agent's, and Tacit's

Two choices, made apart:

- **The agent's model** is the agent's business. Claude Code, Codex and OpenCode all run on DeepSeek. `ollama launch <agent>` runs Claude Code, Codex, OpenCode, OpenClaw, DeepSeek Harness, Cline, Qwen Code and others on a model on this machine. Tacit's hook, line and tools work the same whichever model answers.
- **Tacit's own decisions** (the next step on a page, and the hooks' yes or no) come from the chain in [models.md](models.md): Jev through OpenRouter or TypeSafe, DeepSeek, a decision model in Ollama, or code alone.

Fully local is a configuration, not another harness: the agent on Ollama, and `TACIT_PRIVACY=local` for Tacit. Nothing is then asked of anything off this machine.

## Removing it

Setup keeps the first version of each file it changes as `<file>.before-tacit`. To take Tacit out by hand, remove any of these:

- the line ending in `<!-- tacit -->`;
- the hook whose command runs `daemon/cli.ts hook`;
- `~/.config/opencode/plugins/tacit.ts`;
- the `tacit` entry in an MCP config (`claude mcp remove --scope user tacit`, `codex mcp remove tacit`);
- `~/.bun/bin/tacit` (`bun unlink`, in the tacit folder).

As of October 2026, from each agent's documentation and from `bun run agents:check` on this machine. Agents change their hook formats, so run the check after updating one.
