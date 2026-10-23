# Privacy policy

Effective 22 October 2026. This policy covers the Tacit browser extension and the Tacit harness, the program in this repository that runs on your computer.

**In short:** Tacit reads the pages you visit so it can hand them to your AI agent. What it reads stays in your browser and, if you run it, the Tacit harness on your own computer at `127.0.0.1`. Nothing is sent to the developer, and there is no analytics, telemetry or advertising. The one exception is optional: if you give the harness a key for a model provider, such as OpenRouter, TypeSafe or DeepSeek, it sends short decision requests to that provider, described exactly below. With no key, or with decisions kept on this machine, nothing leaves it.

## Who is responsible

Tacit is an open-source project by Wu JiaJun, released under the MIT license at [github.com/wujiajunhahah/tacit](https://github.com/wujiajunhahah/tacit). There is no company, server or account behind it: the developer never receives any data from your copy of Tacit.

## What the extension reads

On every `http` and `https` page that is not skipped or paused (see below):

- **The page:** its address, title, language and description, and its readable text: headings, paragraphs, list items, code blocks, quotes and captions. Its links and buttons: their text, address and the sentence around them. On X (Twitter) timelines, the text and author of each post.
- **How you got there:** the address of the page you came from, the search you ran, the link you clicked, the tab that opened it, and the kind of navigation (typed, link, back/forward, reload, bookmark, redirect).
- **What you do there:** how long the page is visible and focused, how far you scroll, the text you select or copy on the page, the links, buttons and posts you click (their text, up to 80 characters for a post, and address), and any intent you pick in Tacit.
- **What you read closely:** which passages hold the middle of the screen for 4 seconds of reading or more (time there is split between the passages it shows) while the tab is visible and focused, and, only if you turn on "Read with the pointer" in the popup, which passage your pointer rests on for longer than the threshold you set (0.6 to 4 seconds). For each, Tacit keeps the passage's text (up to 300 characters) and how long, for up to 30 passages per visit. It does not record where your pointer is or how it moves, and it ignores skimming, hidden tabs and any minute without input.

Tacit does not read passwords, cookies or other credentials, and does not read what you type into forms unless you select or copy that text yourself. It never reads your clipboard.

A page can show anything: messages, names, account details. Tacit reads whatever text the page shows, so add sensitive sites, such as your bank, your health portal or your email if it is not Gmail, to the never-read list.

## Where it goes

1. **Your browser's extension storage,** on this computer and not synced to your Google account. Your settings; the last 300 visits (address, title, times, scroll depth, how you arrived, up to 20 selections and 20 copies of up to 2,000 characters each, up to 30 clicks and up to 30 passages read closely per visit); and the last 200 actions Tacit took. Per-tab navigation state is kept in session storage, which the browser clears when it closes. The text of recent pages is held in memory only.
2. **The Tacit harness, if you run it.** The extension sends pages, visits and actions to `http://127.0.0.1:7766`, a program on your own computer. This traffic stays on the loopback interface and never leaves the machine. The harness stores it in a SQLite file, `~/.tacit/tacit.db` (or `$TACIT_HOME`), readable only by your user account (a 0600 file in a 0700 folder). It listens only on `127.0.0.1`, refuses requests from web pages, and answers only clients that hold its token, a random secret in `~/.tacit/token` that `bun run pair` gives to your browser. Like any local data, it is open to other programs running under your account; [SECURITY.md](SECURITY.md) lists these limits.
3. **Your clipboard, when you ask.** Alt+Shift+C (⌥⇧C) copies a Markdown summary of the page for your agent; a copy suggestion copies a command from the page. Where you paste it is up to you.
4. **Nowhere else.** The extension contacts no host other than `127.0.0.1`. Your data is not sold, not shared with advertisers, and not read by anyone else.

## Models you choose

The harness can ask a decision model which suggestion fits what you are doing. This is off until you give the harness a key (`bun run keys set openrouter`, `typesafe` or `deepseek`, stored in `~/.tacit/keys.json`, readable only by your account, or `OPENROUTER_API_KEY` / `TYPESAFE_API_KEY` / `DEEPSEEK_API_KEY` in its environment), or name a server in `~/.tacit/models.json`. The extension popup and the dashboard then say who decides, and the dashboard lists every host decisions can go to. The harness, not the extension, sends each request, with your key:

- **OpenRouter** (`https://openrouter.ai`), with an OpenRouter key: to TypeSafe's Jev, then, if Jev fails or is slow, Inception's decision model; each request asks OpenRouter to route only to endpoints with zero data retention that do not collect data for training. Requests carry two headers that name Tacit as the app (`HTTP-Referer: https://github.com/wujiajunhahah/tacit`, `X-OpenRouter-Title: Tacit`), nothing that names you. A choice the first model is unsure of is asked once more, of a chat model (Gemini 3.1 Flash Lite), under the same routing rules.
- **TypeSafe** (`https://api.typesafe.ai`, or the `TYPESAFE_BASE_URL` you set), with a TypeSafe key: to Jev.
- **DeepSeek** (`https://api.deepseek.com`), with a DeepSeek key: to its chat model `deepseek-flash`, after any decision model above. DeepSeek offers no routing that keeps nothing, so requests are kept and handled under DeepSeek's own terms and privacy policy.
- **A server on this computer** (Ollama, LM Studio, llama.cpp, vLLM), if you name one: the request stays on this machine. With `TACIT_PRIVACY=local`, or `"privacy": "local"` in `models.json`, only such servers are asked.
- **Any other server you name in `models.json`**, under its own terms.

Each request contains:

- your inferred intent, up to 80 characters (for example a recent search, or a passage you selected or copied);
- up to three lines of evidence behind it, such as `searched “jev latency” · 3 min ago` or `read closely “Below roughly 400 milliseconds…”`, quoting up to 60 characters each, drawn from your recent pages on any site Tacit reads;
- the current page's title, full address and kind (article, feed, repository, search);
- the candidates being judged: on most pages, up to 12 next steps on the page, each a label (up to 80 characters) with the text around it (up to 160 characters), such as a section heading with a snippet of its passage, the first line of a code block, or a link's text and its sentence, but not link addresses; on X timelines, up to 40 posts, each with its text (up to 500 characters) and author name.

If you add Tacit's prompt hook to an agent (`tacit hook <agent>`, which `bun run setup` adds only after a yes), the harness also asks, before a prompt reaches that agent's model, whether the prompt builds on what you have open. It asks only when the prompt's own words do not settle it (words such as "this page" do) and only while you have been browsing in the last half hour. That request contains the first 400 characters of the prompt, the current page's title (up to 120 characters) and full address, and your inferred intent.

A chat model receives the same items as JSON, after a fixed instruction on how to answer; a question asked again carries only that question. Nothing else is sent: not your ledger, not other pages, not the rest of your history. While you browse, the harness also opens a connection to each provider with a bare `HEAD` request at most once a minute, so the next decision is not slowed by a new connection; after your computer wakes from sleep, or a request times out, it sends a few at once to replace connections that died. They carry nothing about you or your pages. Each provider handles requests under its own terms and privacy policy. To stop, remove the key (`bun run keys remove openrouter`) or keep decisions on this machine; the harness picks up the change by itself.

## Agents you connect

If you connect an AI agent (Claude Code, Codex, Gemini CLI, Cursor, OpenCode, OpenClaw or any other) to the harness, that agent can read your current page, your intent, your trail and the pages you have read, including the passages you read closely, through five read-only MCP tools or the `tacit` command, which reads the same ledger. With a prompt hook, the agent also receives a short note before a prompt that builds on your screen: the page's title and address, what you seem to be after, how you got there, and what you selected or read closely, about 100 tokens. A program holding the harness's token can also follow `/v1/events`, a stream of what happens in the ledger: visits (address, title, how you arrived, the search you ran), pages (address, title, kind), Tacit's actions, and deletions, which never name the deleted pages. The agent then sends what it reads to its own model provider, under that provider's terms. Tacit cannot control that, so connect only agents you trust.

## Sites Tacit skips, and pausing

- By default Tacit never reads Gmail (`mail.google.com`), Google Account pages (`accounts.google.com`), PayPal, 1Password, Bitwarden or LastPass, nor X messages and chats (`x.com/messages`, `x.com/i/chat`, `twitter.com/messages`). On X, Tacit stops the moment you open your messages. You can edit this list in the popup under "Never read these sites"; an entry is a site, or a site and a path.
- Pages that ask for a password, such as sign-in and sign-up pages, are never read, on any site.
- The popup can pause Tacit everywhere, or on the current site only.
- On a skipped or paused site, Tacit does not run on the page and records no visit. Like any extension that uses Chrome's navigation events, its background script still sees the address of each navigation, and keeps the latest one per tab in session state only, to work out how you reached the next page. If you follow a link out of a skipped site and that tab has no earlier page in your trail, the next page's record can name the skipped site's address, as given by the browser's referrer, as where you came from.
- Chrome does not run Tacit in Incognito windows unless you allow it on `chrome://extensions`. If you do, Incognito pages are read and stored like any other.

## How long it is kept, and how to delete it

- Extension storage keeps the last 300 visits and the last 200 actions. Removing the extension deletes all of it.
- The harness keeps the newest 20,000 visits and the pages they point to, its action ledger until you delete it, and the newest 10,000 events of its event stream; deleting a page deletes the events that name it.
- The dashboard at `http://127.0.0.1:7766` deletes one page (with its visits and what Tacit did there) or everything. The extension forgets the same from its own storage the next time it reaches the harness, and the harness refuses any older copy that arrives later. For that, the harness remembers each deleted page by a SHA-256 hash of its address (the last 1,000 of them) and the time you last deleted everything; it does not keep the address. Treat the folder as private all the same: someone holding the file could still check whether an address they guess was deleted.
- Delete the `~/.tacit` folder to erase everything the harness holds, tombstones included.

## Limited Use

Tacit's use of the information it reads complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. It is used only to provide Tacit's single purpose: making the page you are reading, and how you got to it, available as context to you and your AI agent. Tacit does not transfer it to anyone. The harness sends decision requests to a model provider only when you give it a key or name a server, and only as described above; agents you connect read it at your direction. It is not used for advertising, not used to determine creditworthiness or for lending, and not read by people.

## Security

How the harness and the ledger are protected, and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## Changes

Changes to this policy are made in this file; its history on GitHub shows every version. A change in what Tacit reads or where it sends data will also be noted in the [changelog](CHANGELOG.md).

## Contact

Open an issue at [github.com/wujiajunhahah/tacit/issues](https://github.com/wujiajunhahah/tacit/issues), or, for anything sensitive, use **Security → Report a vulnerability** on the repository.
