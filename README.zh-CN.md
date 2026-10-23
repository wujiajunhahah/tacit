<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
  <img src="docs/assets/logo.svg" width="72" height="72" alt="Tacit">
</picture>

# Tacit

**你的 agent，本该知道你正在看什么。**

Tacit 读取你正在看的页面，以及你是怎么一路来到这里的，把它们留在你自己的电脑上，<br>
再交给 Codex、Claude Code、Gemini CLI、Cursor 或任何 agent。不用再 Cmd+A、复制、粘贴。

[![CI](https://github.com/wujiajunhahah/tacit/actions/workflows/ci.yml/badge.svg)](https://github.com/wujiajunhahah/tacit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-17161c?style=flat-square)](LICENSE)
[![Any agent](https://img.shields.io/badge/any_agent-CLI_·_hooks_·_MCP-9ecd2e?style=flat-square&labelColor=17161c)](#给-agent-用)
[![Local first](https://img.shields.io/badge/your_data-stays_local-9ecd2e?style=flat-square&labelColor=17161c)](#隐私与安全)
[![Bun](https://img.shields.io/badge/Bun-1.4-17161c?style=flat-square)](https://bun.sh)

[English](README.md) · **简体中文** · [使用指南](GUIDE.zh-CN.md) · [宣言](MANIFESTO.zh-CN.md) · [设计](DESIGN.zh-CN.md) · [快速开始](#快速开始) · [给 agent 用](#给-agent-用)

<br>

<img src="docs/assets/demo.gif" width="880" alt="搜索、打开文章：页面底部那一行字说出下一步和理由。跳到答案、专注、把页面交给 agent、折叠信息流、复制安装命令，一切都记进本地账本。">

</div>

<br>

> 我们手里握着人类历史上最聪明的工具。
>
> 然后每天对它做最笨的事：Cmd+A。复制。粘贴。
>
> 我不是在用 AI。我是在给 AI 当搬运工。
>
> <sub>摘自[宣言](MANIFESTO.zh-CN.md)。</sub>

今天所有的界面，都只为一种使用者设计：拿着键盘和鼠标的人。坐在你旁边的 agent 什么也看不见，除非你把页面搬给它。

Tacit 补上的是缺失的 context 这一层。它读页面，也读把你带到这里的那条路径，把两者作为一本 ledger 留在本地；用快速的类型化判断预测你下一步要什么；再让任何 agent 直接读取这些 context。input 应该趋近于零。

## 它能做什么

- **感知。** 读页面（正文、章节、链接、代码块），也读你是怎么来的：搜了什么、点了哪个链接、从哪个标签页打开、选中和复制了什么、停留了多久，以及你细读了哪几段；愿意的话，指针停留也算。像 X 这样边滚动边回收帖子的时间线，也能完整记住。
- **意图。** 推断你想要什么，附上证据和校准过的置信度。你亲口说出的意图，永远优先于任何推断。
- **反射。** 决定下一步：跳到回答你问题的那一段、复制你要找的命令、打开真正相关的链接、折叠无关的帖子。离线时由代码判断；加上 OpenRouter 或 TypeSafe 的 key，就由 [Jev](https://typesafe.ai) 主判，后面还有第二个判断模型兜底，拿不准时再问对话模型。也可以用本地模型，全部留在你的电脑上。
- **界面。** 页面底部安静的一行字：下一步是什么，以及这个判断从哪来（"来自你的搜索"）。有把握时，下一步只差一个按键；接近时给建议；没把握时用选项来问你，而不是让你打字。
- **交接。** ⌥⇧C 把一个精简的上下文包放进剪贴板：意图、来路、选中内容、相关段落、页面大纲。几百个 token，而不是整页。
- **接口。** 任何 agent 都能读到你正在看什么、想做什么，以及你读过的一切：在需要时随提问附上一段说明，`tacit` 命令，或者 MCP 工具。不用复制，不用粘贴，屏幕上的内容用不上时也不花一个 token。
- **学习。** 撤销就是反馈。你撤销得多的地方，Tacit 更谨慎；很少撤销的地方，它更果断；你总是展开的网站，它就不再折叠。没有任何东西需要你调。
- **账本。** 一切都留在你的电脑上。本地 dashboard 就是你的上下文资料库：读过的每一页、细读过的段落、怎么来的，以及 Tacit 做过的每一个动作：建议 → 确认 → 执行 → 撤销。删掉一页或全部，所有地方都会忘掉。
- **你的语言。** 英文和简体中文，跟随浏览器。

| | |
|---|---|
| ![先搜索，再进文章：底部那一行提议跳转](docs/screenshots/article-line.png) | ![展开后：意图、证据和下一步](docs/screenshots/article-slip.png) |
| ![信息流围绕你的搜索被折叠](docs/screenshots/feed.png) | ![代码仓库：那一行直接递给你安装命令](docs/screenshots/repo.png) |
| ![还没有 context：用选项来问你](docs/screenshots/ask.png) | ![上下文资料库：你读过的每一页](docs/screenshots/dashboard-library-zh.png) |
| ![同一个信息流，中文界面](docs/screenshots/feed-zh.png) | ![单页详情：细读过的段落和来路](docs/screenshots/dashboard-page-zh.png) |

## 快速开始

**最快的方式：** 把下面这段话粘贴给 Claude Code、Cursor、Codex 或任何编程 agent，它会帮你装好 Tacit，只在需要你亲手做的那一步叫你。

```text
Set up Tacit on this computer. Read https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md and follow it step by step. Ask me only where it says so.
```

装好之后能玩什么，以及怎么不装任何东西先试一下，见[使用指南](GUIDE.zh-CN.md)。自己动手装的话，需要 [Bun](https://bun.sh) 1.4+，以及 Chrome 或任何 Chromium 内核的浏览器。

```bash
git clone https://github.com/wujiajunhahah/tacit.git
cd tacit
bun install
bun run build
```

**1. 加载扩展。** 打开 `chrome://extensions`，开启开发者模式，点"加载已解压的扩展程序"，选择 `extension` 文件夹。（也可以从 [Releases](https://github.com/wujiajunhahah/tacit/releases) 下载 `tacit-extension-*.zip`，解压后加载。）到这一步，页面底部那一行就已经能用了。

**2. 启动 harness。** 它负责保存账本、回答判断请求，并在 [127.0.0.1:7766](http://127.0.0.1:7766) 提供 dashboard。想让它开机就在后台运行：`bun run service install`。

```bash
bun run harness
```

**3. 配对浏览器。** harness 只回应持有它令牌的客户端。这条命令会打开一个本地页面，把令牌交给扩展：

```bash
bun run pair
```

**4. 接上你的 agent。** `bun run setup` 会找到 Claude Code、Codex、Gemini CLI、OpenCode、Cursor 和 OpenClaw，在你同意后给每个 agent 配上合适的方式：提问要用到屏幕内容时自动附上说明的提示钩子、告诉它有 `tacit` 可用的一行说明，或者 MCP 工具。[docs/agents.md](docs/agents.md)（英文）列出了每个 agent，也有手动配置的方法。只接 Claude Code 的话：

```bash
claude mcp add --scope user tacit -- bun "$PWD/daemon/mcp.ts"
```

然后问你的 agent：*"我正在看的这页，核心观点是什么？"* 不用多说，它就知道。dashboard 的"连接"页给出这些命令，路径是你这台电脑上的绝对路径。

**5. 可选：让 Jev 来判断。** 需要一个 [OpenRouter](https://openrouter.ai) 或 TypeSafe 的 key。输入时不会显示，正在运行的 harness 会自动用上：

```bash
bun run keys set openrouter
bun run models --try     # 现在谁在判断，以及每个引擎在五道题上的表现
```

**6. 先在离线 demo 里试。** 一个离线 demo 站点（搜索引擎、长文章、社交信息流、代码仓库）：

```bash
bun run demo
```

打开 [127.0.0.1:7777](http://127.0.0.1:7777)，搜索 "decision latency"。[127.0.0.1:7777/x/home](http://127.0.0.1:7777/x/home) 是一条像 X 一样回收帖子的时间线。手边没装扩展？打开 [127.0.0.1:7777/try](http://127.0.0.1:7777/try)，Tacit 会以网页脚本的形式在 demo 站点上运行；`/try/off` 关闭。

### 快捷键

| 按键 | 作用 |
|---|---|
| ⌥↵ | 执行第一条建议 |
| ⌥1 ⌥2 ⌥3 | 执行指定的建议；Tacit 询问时，选对应的选项（字母上方那排数字键，不需要小键盘） |
| 1 2 3 | 纸条展开时，效果相同 |
| ⌥⇧C | 把这页复制给你的 agent |
| ⌥⇧F | 只看相关内容 |
| ⌥⇧Z | 撤销上一步 |
| Esc | 收起面板 |

## 给 agent 用

每个 agent 读的都是同一本本地账本，有三种方式，从最省的说起（[docs/agents.md](docs/agents.md) 列出每个 agent，[docs/using-context.md](docs/using-context.md) 讲为什么，均为英文）：

| 方式 | 成本 | 适用 |
|---|---|---|
| 提示钩子：只有当提问要用到你屏幕上的内容时，先附上约 100 个 token 的说明 | 用不上时为零 | Claude Code、Codex、Gemini CLI、Cline，OpenCode 通过插件 |
| 命令行 `tacit`，加上 agent 说明文件里的一行 | 每次请求不到 50 个 token | 任何能用终端的 agent |
| MCP：五个只读工具 | 按需加载工具的 agent 约 100 个 token，预先加载的约 960 个 | Claude Code、Cursor、OpenClaw 和任何 MCP 客户端 |

提问是否要用到屏幕内容：话里直接指向屏幕时（"这篇""this page"）免费判断；否则在你最近半小时浏览过的前提下，由 Jev 在半秒左右给出是或否。拿不准、太慢或太久没浏览，就不附说明。`bun run agents:check` 会让本机装的每个 agent 对着一个本机的替身模型跑一遍，证明说明会送到，而且只在该送的时候送到。

### 命令行

```bash
tacit                        # 现在打开的页面，几行字
tacit now --full             # 这页作为上下文：就是 ⌥⇧C 复制的内容
tacit search "限流"          # 你以前读过的，中英文都能搜
tacit page <url>             # 某一页的全文，以及你细读过的段落
tacit brief --prompt "…"     # 给一次提问的说明，只在需要时给
tacit status                 # harness、账本、由谁判断
```

在 tacit 文件夹里运行 `bun link`，就能直接用 `tacit`；不 link 时用 `bun run tacit`。它直接读账本，而且只读不写，所以在 agent 的沙盒里、harness 停着时都能用。

### 工具（MCP）

五个只读工具，通过 stdio 提供，和 harness 读的是同一本本地账本：

| 工具 | 用户这样说时调用 | 返回 |
|---|---|---|
| `tacit_current_context` | "这页"、"我正在看的"、"这里" | 当前页面的 context 包：意图、来路、选中内容、相关段落、大纲 |
| `tacit_intent` | "帮我弄一下这个"、"下一步做什么" | 推断出的目标、置信度、证据、其他可能 |
| `tacit_trail` | "之前那篇文章"、"刚才那个文档页" | 最近的访问记录，新的在前，附带每次是怎么到达的 |
| `tacit_search` | "讲限流的那篇"、"我之前看的那篇" | 对读过的页面做全文搜索，中英文都可以 |
| `tacit_page` | 搜索或轨迹找到之后 | 页面的完整正文，markdown 格式 |

在 demo 文章上，context 包是 **539 个 token，整页是 4,240 个。** 下面是 agent 收到的一个 context 包的开头（[完整示例](docs/screenshots/agent-view.md)）：

```markdown
# Context: tacit-labs/reflex: Calibrated reflexes for interfaces · Codeyard

**What I'm trying to do** (inferred · 91%): install reflex
- searched “install reflex” · just now

**How I got here:** searched “install reflex” → on “install reflex - Seek”
  → clicked “tacit-labs/reflex: Calibrated reflexes for interfaces”

## Most relevant on this page
### Install
bun add @tacit-labs/reflex
```

Cursor、Claude Desktop、Windsurf 等 MCP 客户端，用同一个 server：

```json
{
  "mcpServers": {
    "tacit": { "command": "bun", "args": ["/absolute/path/to/tacit/daemon/mcp.ts"] }
  }
}
```

### 给其他 harness 用

任何持有 harness 令牌的程序，都可以用 server-sent events 订阅账本里发生的事：访问、页面、Tacit 的动作和删除（删除从不说出被删的页面）。用 `Last-Event-ID` 或 `?since=` 补上错过的部分。

```bash
bun run events                # 打印事件流，每行一个 JSON
curl -N -H "Authorization: Bearer $(cat ~/.tacit/token)" http://127.0.0.1:7766/v1/events
```

## 工作原理

```mermaid
flowchart LR
  subgraph browser["你的浏览器"]
    page["页面"] --> cs["content script<br/>感知 · 那一行字"]
    cs <--> sw["service worker<br/>轨迹 · 来路"]
  end
  sw -->|ingest · decide| harness["harness<br/>127.0.0.1:7766"]
  harness -.->|可选| jev["Jev 和其他判断模型<br/>OpenRouter · TypeSafe · Ollama"]
  harness --> ledger[("账本<br/>~/.tacit/tacit.db")]
  harness --> ui["dashboard"]
  ledger --> port["tacit · 提示钩子 · MCP"]
  port --> agents["Codex · Claude Code · Gemini CLI · OpenCode · Cursor · 任何 agent"]
```

七层，每层都是一个小模块（它们遵守的规则见 [DESIGN.zh-CN.md](DESIGN.zh-CN.md)）：

| 层 | 位置 | 职责 |
|---|---|---|
| 感知 | `extension/src/extract`、`track.ts`、`attention.ts` | 页面模型、来路、选中、复制、点击、阅读 |
| 账本 | `daemon/db.ts` | 访问、页面和动作，存在 `~/.tacit` 下的 SQLite 里 |
| 意图 | `core/intent.ts` | 带时间衰减的证据、候选意图、校准过的置信度 |
| 反射 | `core/decision.ts`、`core/cascade.ts`、`core/systemone.ts`、`core/chat.ts`、`daemon/engine.ts` | 选择题、打分题、是非题，附概率：代码、Jev、任何判断模型或对话模型，组成一条对冲的判断链 |
| 界面 | `extension/src/surface` | 那一行字、展开面板、高亮、专注、折叠 |
| 接口 | `daemon/cli.ts`、`daemon/hooks.ts`、`daemon/agents.ts`、`daemon/mcp.ts`、`core/packet.ts`、`core/brief.ts` | 命令行、各家 agent 的钩子、MCP 工具、交接用的 context 包，以及一段说明什么时候值得它的 token |
| 校准 | `core/calibrate.ts` | 阈值和折叠规则，随你的撤销而移动 |

`core/` 是扩展和 harness 共用的纯 TypeScript。通信协议在 [`core/protocol.ts`](core/protocol.ts)。

### Tacit 问模型什么

在文章页，只问一道选择题：*根据用户想做的事，下面哪一个是他下一步想要的？* 选项是页面上最好的几个动作，外加"都不是"。在信息流里，每个帖子问一道是非题：*这个帖子和用户此刻想做的事有关吗？* 答案带着概率回来。综合置信度高于 0.6 时，下一步只差一个按键（⌥↵）；高于 0.35 时给建议；再低就问你。校准会按你的撤销率移动 0.6 这条线。

由谁来回答，是一条链。有 OpenRouter key 时：先问 Jev 1.14；Jev 出错或 800 毫秒还没回答，就同时问 Inception 的 mercury-decide；最后是代码。第一个答案拿不准的选择，再问一次 Gemini 3.1 Flash Lite，留下更有把握的那个。全部在 3.2 秒之内，而本地结果早已显示在屏幕上。在 Tacit 自己的样例题上，Jev 全部答对，中位数 488 毫秒，一次判断大约 0.00002 美元。每种 key 的默认链、本地模型、`models.json` 和实测数据见 [docs/models.md](docs/models.md)（英文）。

## 原则

这些原则来自[宣言](MANIFESTO.zh-CN.md)。

- **界面可以千人千面，语义不能。** 每个动作都有明确的状态（建议、确认、执行、撤销），并写进账本。没有一次按键或点击，什么都不会执行；唯一不经你同意就做的是折叠，点一下就能恢复。
- **有把握就做，没把握就问。** 阈值是界面设计，不是模型输出。
- **折叠，而不隐藏。** 每次折叠都说明原因、显示数量，一次点击就能恢复。个性化不该悄悄缩小你能看到、能做到的范围。
- **说清楚判断从哪来。** 每个预测都带着它的出处。
- **默认本地。** 除非你加上模型的 key，否则什么都不会离开你的电脑；加上后，也只有判断请求会发出去。用本地模型，连这些也留在本机。

完整的规则，包括每个信号和它的权重，见 [DESIGN.zh-CN.md](DESIGN.zh-CN.md)。

## 隐私与安全

扩展会读你访问的每一个页面，所以它被设计成尽量不打扰你，也不外传它看到的东西。

- **页面内容只去一个地方：** 127.0.0.1 上的 harness。没有遥测，没有统计，没有云端。
- **默认跳过一些网站**（Gmail、Google 账户、PayPal、1Password、Bitwarden、LastPass），也跳过 X 私信这样的私密区域，以及任何要输入密码的页面：一打开，Tacit 就停下。也可以在弹出面板里全局暂停，或只在当前网站暂停。
- **指针跟读默认关闭。** 打开后，Tacit 只记哪一段、停了多久，从不记录指针去了哪里。
- **harness 只监听本机回环地址**，只回应持有令牌的客户端；而客户端会先让 harness 证明它持有同一个令牌，所以占了端口的程序什么也拿不到。它还拒绝不认识的 `Host` 头（防 DNS rebinding），拒绝来自网页的请求，只对扩展开放 CORS，账本页面使用基于 nonce 的 CSP。
- **账本是 `~/.tacit` 里的 SQLite**，只有你自己可读（文件 0600，目录 0700）。在 dashboard 里删掉一页或全部，扩展也会一起忘掉。
- **模型需要你主动开启。** 加上 key 后，每次判断会发送：推断出的意图、最主要的证据、页面标题和 URL，以及正在被判断的候选项（页面上可能的下一步的文字和简短片段，或最多 40 条信息流帖子）；经 OpenRouter 时只发往零数据留存的端点。装了提示钩子时，话里没有直接指向屏幕的提问，会把前 400 个字符连同页面标题、URL 和你的意图发去判断是或否。账本本身永远不会离开你的电脑。key 只存在 `~/.tacit/keys.json`，从不写进日志或服务文件。`TACIT_PRIVACY=local` 只询问你电脑上的模型。

[隐私政策](PRIVACY.md)（英文）列出了 Tacit 读取的全部内容、它们的去向、发给模型的确切字段，以及如何删除。发现漏洞？请看 [SECURITY.md](SECURITY.md)。

## 进展

一个能用的原型，每次推送都在真实浏览器里验证：224 个单元测试；45 项端到端检查（真实 Chromium、构建好的扩展、demo 站点、harness、配对、dashboard 和一个 MCP 客户端）；以及 20 项网页运行时检查，包括一个仿 X 的虚拟时间线。`bun run live` 在五个真实网站上跑扩展（中英文维基百科、GitHub、MDN、Hacker News），设了 key 时连真实模型一起测。`bun run agents:check` 让本机装的 Claude Code、Codex、Gemini CLI 和 OpenCode 对着替身模型各跑一遍。

- [x] 扩展：感知、意图、那一行字、专注、折叠、交接
- [x] harness：本地账本、中英文搜索、作为上下文资料库的 dashboard
- [x] 五个工具的 MCP server
- [x] 任何 agent：`tacit` 命令、只在提问需要时才附上说明的提示钩子，以及为 Claude Code、Codex、Gemini CLI、OpenCode、Cursor 和 OpenClaw 做的一键接入
- [x] 由 Jev、任何判断模型或对话模型、或本地模型来判断，组成对冲的判断链，代码兜底
- [x] 阅读注意力、X 时间线、按撤销校准
- [x] 英文和简体中文
- [x] 按网站的规则、私密路径，以及删除能到达每一份副本
- [x] 使用指南，以及把一句话粘贴给 agent 就能装好
- [x] 几个月的浏览历史也能快速搜索（SQLite FTS5）
- [x] 令牌与配对、给其他 harness 的事件流、后台服务
- [ ] 线索（threads）：把几个月的阅读变成 agent 最先读的东西
- [ ] 自己的终端界面，类似 Mole 或 gstack
- [ ] 上架 Chrome Web Store
- [ ] Firefox 和 Safari
- [ ] 桌面：通过 macOS 辅助功能 API 做同样的感知
- [ ] 来自 PDF、视频和本地文件的 context
- [ ] 跟着意图长出来的界面：想比较时是一张表，想理解时是一张图

## 开发

```bash
bun run setup       # 构建、检查、接上找到的 agent（会先问你）
bun test            # 单元测试：core、扩展、harness
bun run typecheck   # tsc，严格模式
bun run e2e         # 真实 Chromium + 扩展 + demo 站点 + harness + dashboard + MCP
bun run e2e:web     # demo 站点上的网页运行时：阅读、X 时间线、中英文
bun run live        # 在五个真实网站上跑扩展；设了 key 时连真实模型一起测
bun run agents:check  # 本机装的每个 agent 对着替身模型跑一遍：说明是否送到，是否只在该送时送到
bun run models      # 现在谁在判断；--try 逐个检查引擎
bun run keys        # 列出、设置或删除模型的 key
bun run service     # 安装、卸载或检查后台服务
bun run events      # 订阅账本的事件流
bun run record      # 重新录制 docs/tacit-demo.mp4
```

```
core/        意图、排序、判断、context 包、通信协议
extension/   Chrome MV3 扩展：感知和那一行字（也构建成 dist/tacit-web.js，供 demo 和测试使用的网页脚本）
daemon/      harness：SQLite 账本、HTTP API、dashboard、MCP server
demo/        离线 demo 站点：搜索、文章、信息流、代码仓库
scripts/     构建、端到端测试、录屏、冒烟测试
test/        bun 测试
```

欢迎贡献，从 [CONTRIBUTING.md](CONTRIBUTING.md) 开始。

## 许可证

[MIT](LICENSE) © 2026 Wu JiaJun

<div align="center">
<br>
<sub>最好的交互，是最少的交互。</sub>
</div>
