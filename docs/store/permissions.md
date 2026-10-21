# Privacy practices: permissions and data use

Answers for the **Privacy practices** tab of the developer dashboard. Each block in "Permission justifications" goes into the field of the same name. Everything here was checked against the code at v0.2.0; file references are given so a reviewer, or you after a change, can check again.

## Permission justifications

### storage

```text
Saves Tacit's settings (paused, sites paused, sites and paths never to read, reading with the pointer and its threshold, language) and the recent trail it reasons over, so both survive the service worker restarting. chrome.storage.local holds the last 300 page visits (address, title, times, scroll depth, how the page was reached, the text selected or copied, the links and posts clicked, and the passages read closely there) and the last 200 actions Tacit took. chrome.storage.session holds per-tab navigation state, which Chrome clears when the browser closes. This data stays in the browser; the only place it is sent is the harness the user runs on their own computer at 127.0.0.1.
```

Code: `extension/src/settings.ts`, `save()` and `load()` in `extension/src/background.ts`.

### webNavigation

```text
Tacit's core feature is knowing how the user reached a page: from a search, a link, a typed address, a bookmark, back/forward or a reload. Only webNavigation reports this. onCommitted gives the transition type and qualifiers; onBeforeNavigate gives the address requested before a redirect, so a search that redirects straight to a result still counts as a search; onHistoryStateUpdated reports in-page navigation in single-page apps, so Tacit reads the new page. Only top-level frames are used, and the state is kept per tab in session storage.
```

Code: the three `chrome.webNavigation` listeners and `computeArrival()` in `extension/src/background.ts`.

### clipboardWrite

```text
Tacit writes to the clipboard only when the user asks. Alt+Shift+C (or "Copy for agent") copies a Markdown context packet of the current page, to paste into an AI agent; a copy suggestion copies a command from a code block on the page. The permission keeps this working where the asynchronous Clipboard API is unavailable (plain-http pages) or blocked by the site, through the document.execCommand('copy') fallback. Tacit never reads the clipboard.
```

Code: `extension/src/clipboard.ts`, `handoff()` and `copyAction()` in `extension/src/content.ts`.

### Host permissions (`http://*/*`, `https://*/*`)

```text
Tacit's single purpose is to make the page the user is reading available as context, on whatever site they read it, so its content script runs on all http and https pages to read the page's text and links and how the user reached and used the page. Sites and paths on the never-read list (by default Gmail, Google Account pages, PayPal, 1Password, Bitwarden, LastPass, and X messages and chats) and paused sites are skipped: the content script does not read them. The same access lets the popup show which site the active tab is on, so it can be paused there, without the tabs permission. The service worker also needs to reach http://127.0.0.1:7766, the harness the user runs on their own computer, which is the only address Tacit sends data to.
```

Code: `host_permissions` and `content_scripts` in `extension/manifest.json` (http and https only), `DEFAULT_SETTINGS` and `isActiveAt()` in `extension/src/settings.ts`, `activeTab()` in `extension/src/popup.ts`, `HARNESS_ORIGIN` in `core/protocol.ts`. There is no `tabs` permission: tab events, messaging a tab and opening a tab do not need it.

## Remote code

Choose **"No, I am not using remote code."** All JavaScript is bundled into `extension/dist/` at build time. The extension makes requests to `http://127.0.0.1:7766` only (`/v1/health`, `/v1/ingest`, `/v1/decide`, `/v1/forgotten`, and `/v1/connect` from the popup), all JSON, and never loads or evaluates code from there or anywhere else. The built files contain no `eval` and no `new Function`. The only other URLs in them are two links in the popup to the guide on GitHub, which open as an ordinary tab when the user clicks one.

## Data usage

Tick these three, and leave the others unticked:

| Category | Tick | What Tacit handles |
|---|---|---|
| Web history | Yes | Address, title and times of each page visited; the page it came from and the search that led to it. |
| User activity | Yes | Clicks on links, buttons and posts (label and address), scroll depth, time the page is visible and focused, text selected or copied, and which passages stay in the middle of the screen, or under the resting pointer when the user turns that on, and for how long. No pointer positions are kept. |
| Website content | Yes | Page text (headings, paragraphs, lists, code, quotes, captions), links (text, address, surrounding sentence), meta description; on X timelines, post text and author names. |
| Personally identifiable information | No | Not collected as such. Anything a page happens to show is covered by Website content, and PRIVACY.md says so. |
| Health information | No | Same as above. |
| Financial and payment information | No | Same as above. PayPal is skipped by default. |
| Authentication information | No | No passwords, credentials or cookies. Text typed into forms is not read unless the user selects or copies it. |
| Personal communications | No | Not collected as such; Gmail is skipped by default. Messages shown on other pages count as Website content. |
| Location | No | None. |

Tick all three certifications: no selling or transferring data to third parties outside the approved use cases; no use or transfer unrelated to the single purpose; no use or transfer for creditworthiness or lending. All three hold: the developer receives no data at all, and the one transfer to a third party (Jev, below) happens only when the user sets it up, to serve the single purpose.

Privacy policy URL: `https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md`. It contains the public Limited Use statement the User Data FAQ asks for, and the README links to it.

## Where the data goes

| What | Where | Kept |
|---|---|---|
| Settings, and the time of the last deletion in the harness it applied | `chrome.storage.local` | Until changed or uninstalled |
| Trail: the last 300 visits, each with up to 20 selections and 20 copies (2,000 characters each), the last 30 clicks and up to 30 passages read closely (300 characters each) | `chrome.storage.local` | Oldest dropped past 300; forgotten when deleted in the dashboard; deleted on uninstall |
| Action ledger: the last 200 actions (jump, copy, open, focus, fold, handoff, picked intent) | `chrome.storage.local` | Oldest dropped past 200; deleted on uninstall |
| Per-tab state: the current visit, the last navigation (address, transition type), the address requested before a redirect, the last link clicked, the opener tab | `chrome.storage.session` | Until the browser closes |
| Page models of the last 30 pages; up to 500 events waiting for the harness | Service worker memory | Until the service worker stops |
| Pages (up to 400 text blocks of 4,000 characters, up to 300 links and buttons), visits, actions | The harness, over plain HTTP on the loopback interface, into `~/.tacit/tacit.db` (0600 file in a 0700 folder) | Newest 5,000 visits and their pages; actions until deleted from the dashboard or the folder is deleted. A deleted page is remembered by a SHA-256 hash of its address (the last 1,000), never the address |
| The context packet, or a command from a code block | The clipboard | Only when the user presses Alt+Shift+C or runs a copy suggestion |
| Decision requests (below) | TypeSafe's API over HTTPS, sent by the harness | Only when the harness has a TypeSafe key |

Loopback traffic never leaves the machine. The extension itself has no code path to any host other than `127.0.0.1`.

## Exactly what goes to TypeSafe's Jev

Off unless the user starts the harness with `TYPESAFE_API_KEY`; the popup then says "Decisions by Jev". The path:

1. `buildDecision()` in `extension/src/view.ts` builds the request in the page.
2. The service worker posts it to the harness at `http://127.0.0.1:7766/v1/decide` (`decide()` in `extension/src/background.ts`).
3. The harness's `JevEngine` (`core/jev.ts`) sends `POST https://api.typesafe.ai/v1/systemone` (or `TYPESAFE_BASE_URL`) with `Authorization: Bearer <the user's key>` and the body `{ model, state, questions }`. Any error, or no answer within 2.5 s, falls back to the local engine.

The content script asks once per page view and again when the intent or the page changes (`refine()` in `extension/src/content.ts`). The body holds:

| Field | Content | Limit |
|---|---|---|
| `model` | `TYPESAFE_MODEL`, else `jev-latest` | |
| `state.user_intent` | The inferred or stated intent: a recent search, a passage the user selected or copied, something they said, or a page title | 80 characters |
| `state.evidence` | Up to three lines like `searched “jev latency” · 3 min ago`, `selected “…” · just now`, `read closely “…” · just now`, `read “page title” · 5 min ago`, from the last 30 visits within the last 90 minutes (any tab, any site Tacit was allowed to read) | 3 lines, 60 characters quoted per line |
| `state.page` | The current page's `title`, full `url` (including query string and fragment) and `kind` (article, feed, repo, search, unknown) | |
| `questions.next` (pages other than X timelines) | A choice among up to 12 candidate next steps plus "none". Each option is `"<n>. <label>"` with the text around it as its description. Candidates are jumps to the best sections (heading, passage snippet), copies of code blocks (first line, code snippet) and the page's links and buttons (their text, the sentence around them). Link addresses are not sent. | 12 options; label 80, description 160 characters |
| `questions.post_0` … `post_39` (X timelines) | One yes/no question per post: "Is this post about what the user is trying to do right now?", with the post text and author name, in page order | 40 posts; text 500, author 80 characters |

Nothing else: not the ledger, not other pages, not the trail beyond those three evidence lines, not page text beyond the snippets above.
