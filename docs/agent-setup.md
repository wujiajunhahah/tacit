# Set up Tacit

Instructions for a coding agent (Claude Code, Codex, Gemini CLI, OpenCode, Cursor, …) setting up Tacit for its user.

Tacit is a browser extension and a small local server, the harness. Together they record the page the user is on and how they got there, keep it on this machine, and give it to you: as a note before a prompt that needs it, through the `tacit` command, or over MCP. The user never has to paste a page into a chat again.

Do the steps yourself. Stop and ask the user only where a step says **Ask**. Talk to the user in their language.

## 1. Bun

Run `bun --version`. Tacit needs 1.4 or later. If Bun is missing, **Ask** before installing it: `curl -fsSL https://bun.sh/install | bash` on macOS and Linux, `powershell -c "irm bun.sh/install.ps1 | iex"` on Windows. If it is older, run `bun upgrade`.

## 2. The code

If the user already has a `tacit` checkout, use it. Otherwise: `git clone https://github.com/wujiajunhahah/tacit.git ~/tacit`. Work in that folder from here on.

## 3. Setup

Run `bun install`, then `bun run setup --dry-run`, and read what it would do. For each agent it finds here (Claude Code, Codex, Gemini CLI, OpenCode, Cursor, OpenClaw), it says what it would add and in which file: a prompt hook, a line in the agent's instructions, or the MCP tools. It also offers `bun link`, which makes `tacit` a command.

**Ask** the user whether to make those changes, and list them. If they agree, run `bun run setup --yes`. Otherwise run `bun run setup` and tell them what it printed. Setup keeps the first version of every file it changes next to it, as `<file>.before-tacit`.

If you are an agent setup did not find, [agents.md](agents.md) says what to add for you. **Ask** before adding it. If setup says Codex runs a new hook only once it is trusted, tell the user: open Codex and trust it in `/hooks`.

## 4. The harness

If setup says the harness is not running, **Ask** whether it should start at login and stay up. If yes, on macOS or Linux run `bun run service install --yes`. If not, or on Windows, start it for this session and leave it running:

```bash
mkdir -m 700 -p ~/.tacit && nohup bun run harness >> ~/.tacit/harness.log 2>&1 &
```

On Windows, start `bun run harness` in a terminal of its own. Check with `curl -s http://127.0.0.1:7766/v1/health`: it answers `"authorized": false` without the harness's token, which is expected. If setup says a running harness keeps its ledger somewhere else, tell the user, and only stop that process if they agree.

## 5. The extension

**Ask** the user to do this; only a person can. Give them the absolute path of the `extension` folder: open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on Developer mode, click **Load unpacked**, and choose that folder. Wait until they say it is done.

Then run `bun run pair`. It opens a pairing page in their browser (on macOS, Chrome if it is installed); it never prints the token. **Ask** the user to open it in the browser where they loaded the extension if it opened elsewhere, and to tell you when the page says the browser is paired.

## 6. Check that it works

**Ask** the user to search for anything in that browser and open a result. Then:

- `curl -s -H "Authorization: Bearer $(cat ~/.tacit/token)" 'http://127.0.0.1:7766/v1/trail?limit=1'` shows the visit. Never print the token itself.
- Run `bun run tacit` in the folder (or `tacit`, if it is linked). It prints the page they opened, what they seem to be after and how they got there.
- Hooks and new MCP servers take effect in new sessions. Claude Code shows a newly created skills folder after `/reload-skills`. If something is missing, tell the user to restart their agent.

## 7. Tell the user what to try

In three lines or fewer: the line at the bottom of each page shows the next step; ⌥↵ takes it and ⌥⇧C copies the page for an agent; and they can ask you "what's the main point of the page I'm reading?" without pasting anything. The full guide is `GUIDE.md` in the checkout (`GUIDE.zh-CN.md` in Chinese).

## Rules

- Tacit needs no API key and no account. Do not ask for one unless the user brings it up. If they want Jev to decide, ask them to run `bun run keys set openrouter` (or `typesafe`, or `deepseek` where OpenRouter needs a proxy) in their own terminal: it asks for the key without showing it. Never ask them to paste a key to you, and never write one into a file yourself. `bun run models` then says who decides; `bun run models --try` checks it.
- Do not change Tacit's source. Building writes `extension/dist` and `dist`; that is expected.
- Everything stays on this machine. The harness listens on 127.0.0.1 only.
