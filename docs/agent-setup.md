# Set up Tacit

Instructions for a coding agent (Claude Code, Cursor, Codex, Windsurf, …) setting up Tacit for its user.

Tacit is a browser extension and a small local server, the harness. Together they record the page the user is on and how they got there, keep it on this machine, and give it to you over MCP, so the user never has to paste a page into a chat again.

Do the steps yourself. Stop and ask the user only where a step says **Ask**. Talk to the user in their language.

## 1. Bun

Run `bun --version`. Tacit needs 1.4 or later. If Bun is missing, **Ask** before installing it: `curl -fsSL https://bun.sh/install | bash` on macOS and Linux, `powershell -c "irm bun.sh/install.ps1 | iex"` on Windows. If it is older, run `bun upgrade`.

## 2. The code

If the user already has a `tacit` checkout, use it. Otherwise: `git clone https://github.com/wujiajunhahah/tacit.git ~/tacit`. Work in that folder from here on.

## 3. Setup

Run `bun install`, then `bun run setup --dry-run`, and read what it would do.

- **If you are Claude Code:** **Ask** whether to add Tacit to Claude Code for every project and install the Tacit skill in `~/.claude/skills`. If the user agrees, run `bun run setup --yes`. Otherwise run `bun run setup`.
- **Any other client:** run `bun run setup`. It prints an MCP server entry. **Ask**, then add it to your own MCP configuration the way your client does it.

## 4. The harness

If setup says the harness is not running, start it in the background and leave it running:

```bash
mkdir -m 700 -p ~/.tacit && nohup bun run harness >> ~/.tacit/harness.log 2>&1 &
```

On Windows, start `bun run harness` in a terminal of its own. Check with `curl -s http://127.0.0.1:7766/v1/health`. If setup says a running harness keeps its ledger somewhere else, tell the user, and only stop that process if they agree.

## 5. The extension

**Ask** the user to do this; only a person can. Give them the absolute path of the `extension` folder: open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on Developer mode, click **Load unpacked**, and choose that folder. Wait until they say it is done.

## 6. Check that it works

**Ask** the user to search for anything in that browser and open a result. Then:

- `curl -s 'http://127.0.0.1:7766/v1/trail?limit=1'` shows the visit.
- If you have the Tacit tools, call `tacit_current_context`. Claude Code shows a newly added MCP server in new sessions, and a newly created skills folder after `/reload-skills`: if the tools are missing, tell the user to restart Claude Code.

## 7. Tell the user what to try

In three lines or fewer: the line at the bottom of each page shows the next step; ⌥↵ takes it and ⌥⇧C copies the page for an agent; and they can ask you "what's the main point of the page I'm reading?" without pasting anything. The full guide is `GUIDE.md` in the checkout (`GUIDE.zh-CN.md` in Chinese).

## Rules

- Tacit needs no API key and no account. Do not ask for `TYPESAFE_API_KEY` unless the user brings it up. If they give you one, pass it only to the harness process (`TYPESAFE_API_KEY=… bun run harness`), never into a file.
- Do not change Tacit's source. Building writes `extension/dist` and `dist`; that is expected.
- Everything stays on this machine. The harness listens on 127.0.0.1 only.
