# Chrome Web Store listing

Text for the **Store listing** tab of the developer dashboard, plus the single-purpose statement from the **Privacy practices** tab. Permission justifications and data disclosures are in [permissions.md](permissions.md); images are next to this file.

## Name

```text
Tacit — context harness
```

Taken from `name` in `extension/manifest.json` (23 of 75 characters). The dashboard does not let you edit it; change the manifest and upload again.

## Summary

```text
Reads the page and how you got here, predicts what you need next, and hands the context to your AI agent. Local by default.
```

Taken from `description` in `extension/manifest.json` (123 of 132 characters). It also shows on `chrome://extensions`.

## Category

**Developer Tools.** The agent half (the harness, the MCP server) needs Bun and an MCP client such as Claude Code or Cursor, so the people who get the most out of Tacit are developers. If you want to reach people who only use the line and the ⌥⇧C packet, **Workflow & Planning** is the other honest fit.

## Language

English. A 简体中文 listing needs a `_locales/zh_CN` folder in the package (with `default_locale` in the manifest); the dashboard only offers languages the package ships. Until then, the Chinese text below is ready but has nowhere to go.

## Single purpose

For the **Single purpose** field on the Privacy practices tab:

```text
Tacit makes the page you are reading, and how you got to it, available as context: on the page, as one line that points to the part you came for, and to your AI agent, as a copy-ready packet and through a harness program you run on your own computer. Everything Tacit does serves that purpose: it reads the page and the path that led there, infers what you are after, suggests the next step (jump to a passage, copy a command, open a link, fold unrelated posts) and hands the context to your agent. It has no ads, no accounts and no features unrelated to this.
```

## Detailed description (English)

```text
Your agent should already know what you're looking at.

Tacit reads the page you're on and how you got there, and hands that context to your AI agent. No more select-all, copy, paste.

WHAT TACIT READS, AND WHERE IT GOES
• The page: its title and address, its headings, paragraphs, lists, code blocks and quotes, and its links and buttons (their text, address and the sentence around them). On X, the posts in the timeline.
• How you got there: the search you ran, the link you clicked, the tab it came from.
• What you do there: how long the page is in front of you, how far you scroll, the text you select or copy, the links and buttons you click.

All of it goes to one place: the Tacit harness, an open-source program you run on your own computer at 127.0.0.1. The extension sends nothing to the developer or to any other server. No analytics, no telemetry, no ads. By default Tacit never reads Gmail, Google Account pages, PayPal, 1Password, Bitwarden or LastPass. Pause Tacit everywhere or on one site from the toolbar popup, and add any site to the never-read list.

ON THE PAGE
• One quiet line at the bottom of the page says what's next, and why ("from your search"): jump to the passage that answers you, copy the command you came for, open the link that matters.
• Jumps, copies and links run only when you press a key or click. Alt+Enter runs the top suggestion, Alt+1 to Alt+3 a specific one, Alt+Shift+F focuses on what matches, Alt+Shift+Z undoes. (Alt is ⌥ on a Mac.)
• Alt+Shift+C copies a compact Markdown packet for your agent: your intent, how you got here, your selection, the relevant passages and the outline. A few hundred tokens instead of the whole page.
• On X timelines, posts that don't match what you came for fold into one line. One click brings them back.
• When Tacit isn't sure what you're after, it asks with choices instead of guessing.

FOR YOUR AGENT
Run the harness (it needs Bun) and add its MCP server to Claude Code, Cursor, Claude Desktop, Windsurf or any MCP client. Five read-only tools give the agent the page you're on, what you're trying to do, your recent trail, full-text search over what you've read, and the text of any of those pages. The ledger is a SQLite file in ~/.tacit that only your user account can read.
Setup: https://github.com/wujiajunhahah/tacit#quick-start

The extension also works alone: the line, the jumps and the Alt+Shift+C packet need no harness.

OPTIONAL: TYPESAFE'S JEV
If you start the harness with your own TypeSafe API key, the harness asks Jev, TypeSafe's decision model, which suggestion fits. Each request carries your inferred intent, up to three pieces of evidence behind it, the page's title and address, and the candidates being judged: the labels and short snippets of the page's best next steps, or up to 40 posts from a timeline. Without a key, Tacit sends nothing off your computer.

Open source under the MIT license.
Privacy policy: https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md
```

## Detailed description (简体中文)

```text
你的 agent，本该知道你正在看什么。

Tacit 读取你正在看的页面，以及你是怎么来到这里的，再把这份上下文交给你的 AI agent。不用再全选、复制、粘贴。

TACIT 读什么，送去哪里
• 页面本身：标题和网址，正文里的标题、段落、列表、代码块和引用，以及页面上的链接和按钮（文字、网址和它们所在的那句话）。在 X 上，是时间线里的帖子。
• 你怎么来的：你搜了什么，点了哪个链接，从哪个标签页打开。
• 你在页面上做了什么：页面在你眼前停留多久，滚动到哪里，你选中或复制的文字，你点的链接和按钮。

这些只去一个地方：Tacit harness，一个开源程序，运行在你自己的电脑上（127.0.0.1）。扩展不会把任何东西发给开发者或其他服务器。没有统计，没有遥测，没有广告。Gmail、Google 账户页面、PayPal、1Password、Bitwarden 和 LastPass 默认不读。你可以在工具栏弹出面板里全局暂停，或只在当前网站暂停，也可以把任何网站加入“永不读取”列表。

在页面上
• 页面底部一行安静的字，告诉你下一步是什么，以及为什么（“来自你的搜索”）：跳到回答你问题的那一段，复制你要找的命令，打开真正相关的链接。
• 跳转、复制和打开链接，都要等你按键或点击才会执行。Alt+Enter 执行第一条建议，Alt+1 到 Alt+3 执行指定的一条，Alt+Shift+F 专注于相关内容，Alt+Shift+Z 撤销。（Mac 上 Alt 即 ⌥。）
• Alt+Shift+C 为你的 agent 复制一份精简的 Markdown context 包：你的意图、你怎么来的、你选中的文字、相关段落和页面大纲。几百个 token，而不是整个页面。
• 在 X 的时间线上，和你来意无关的帖子会折叠成一行，点一下就回来。
• 拿不准你想要什么时，它会给出选项来问你，而不是瞎猜。

给你的 AGENT
运行 harness（需要 Bun），把它的 MCP server 加到 Claude Code、Cursor、Claude Desktop、Windsurf 或任何 MCP 客户端。五个只读工具让 agent 读到：你正在看的页面、你想做的事、你最近的浏览轨迹、对你读过内容的全文搜索，以及其中任意页面的全文。账本是 ~/.tacit 里的一个 SQLite 文件，只有你自己的系统账户能读。
安装说明：https://github.com/wujiajunhahah/tacit#quick-start

扩展也可以单独使用：那一行字、跳转和 Alt+Shift+C 的 context 包都不需要 harness。

可选：TYPESAFE 的 JEV
如果你用自己的 TypeSafe API key 启动 harness，harness 会请 TypeSafe 的判断模型 Jev 来选哪条建议最合适。每次请求包含：推断出的意图，支撑它的最多三条证据，页面标题和网址，以及正在被判断的候选项（页面上最可能的下一步的文字和简短片段，或时间线上最多 40 条帖子）。不设置 key，Tacit 不会把任何东西发出你的电脑。

以 MIT 许可证开源。
隐私政策：https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md
```

## Links

| Field | Value |
|---|---|
| Homepage URL | `https://github.com/wujiajunhahah/tacit` |
| Support URL | `https://github.com/wujiajunhahah/tacit/issues` |
| Privacy policy URL (Privacy practices tab) | `https://github.com/wujiajunhahah/tacit/blob/main/PRIVACY.md` |
| Mature content | No |

The privacy policy URL only works once `PRIVACY.md` is pushed to `main`.

## Graphic assets

Rendered by `bun run store` from the demo site with the built extension (see `scripts/store.ts`). Upload the screenshots in this order; the first one is the thumbnail people see in search.

| Dashboard field | File |
|---|---|
| Store icon (128×128) | `icon-128.png` |
| Screenshot 1 | `screenshot-1-intent.png` |
| Screenshot 2 | `screenshot-2-handoff.png` |
| Screenshot 3 | `screenshot-3-command.png` |
| Screenshot 4 | `screenshot-4-feed.png` |
| Screenshot 5 | `screenshot-5-local.png` |
| Small promo tile (440×280) | `promo-small.png` |
| Marquee promo tile (1400×560) | Optional; only needed to be featured in the marquee. Not made. |
| Promo video | Optional. `docs/tacit-demo.mp4` is attached to each GitHub release; the field takes a YouTube link only. |
