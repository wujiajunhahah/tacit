[English](GUIDE.md) · 简体中文

# Tacit 怎么用

Tacit 读你正在看的页面，也读你是怎么来的，再把它交给你的 agent。你不用再把整页复制粘贴进对话框。这一页讲怎么试、怎么装、怎么用，以及怎么推荐给别人。

## 一分钟试一下

不用装扩展，不用注册，不用 key。只需要 [Bun](https://bun.sh) 1.4 或更高版本。

```bash
git clone https://github.com/wujiajunhahah/tacit.git && cd tacit
bun install && bun run build && bun run demo
```

打开 [127.0.0.1:7777/try](http://127.0.0.1:7777/try)，搜 "decision latency"，点开第一个结果。页面底部那一行字就是 Tacit。打开 `/try/off` 可以关掉。

## 让 agent 帮你装

把这段话粘贴给 Claude Code、Cursor、Codex 或任何编程 agent：

```text
Set up Tacit on this computer. Read https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md and follow it step by step. Ask me only where it says so.
```

agent 会下载代码、构建、把自己和找到的其他 agent 接上、启动 harness，并检查一切是否正常。只有一件事需要你亲手做：在 Chrome 里加载扩展，到那一步它会叫你。如果你的 agent 打不开链接，就把[完整的 prompt](docs/agent-setup.md) 整段粘贴给它。

## 或者自己装

1. `bun install && bun run setup`：构建、检查，并接上你装了的 agent：Claude Code、Codex、Gemini CLI、OpenCode、Cursor、OpenClaw。改动文件夹以外的任何东西之前，它都会先问你。
2. 加载扩展：打开 `chrome://extensions`，开启开发者模式，点"加载已解压的扩展程序"，选择 `extension` 文件夹。
3. 运行 `bun run harness` 并保持运行。它保存你的账本，并在 [127.0.0.1:7766](http://127.0.0.1:7766) 提供面板。想让它开机自动运行、一直在后台：`bun run service install`。
4. `bun run pair`：在浏览器里打开配对页，把扩展和 harness 配对。配对之前，harness 不会和它分享任何东西。
5. 可选：`bun run keys set openrouter`，让 Jev 来判断（见下文）。

## 试试这些

| 这样做 | 会看到 |
|---|---|
| 随便搜点什么，点开一个结果 | 底部那一行字：下一步，以及判断从哪来（"来自你的搜索"） |
| 按 ⌥↵ | 直接带你过去，那一行字显示"已跳到…·撤销" |
| 按 ⌥⇧C | 这一页变成给 agent 的上下文，放进剪贴板：几百个 token，而不是整页 |
| 打开一个很长的信息流，或者 X | 和你在找的东西无关的帖子会折叠起来："折叠了 7 条 · 展开" |
| 认真读一段几秒钟 | 它会进入你的上下文。把鼠标移到那一行字上："细读了 1 段" |
| 打开一个没有任何线索的页面 | 显示"在找…"，给三个选项，按 ⌥1–3 直接选 |
| 问你的 agent："我正在看的这页，核心观点是什么？" | 它已经收到了关于这页的说明，或者通过 Tacit 读到这一页，然后回答，不用粘贴任何东西 |
| 问它一件和这页无关的事 | 不附说明，不在你的屏幕上花一个 token |
| 在终端里运行 `tacit`（在文件夹里用 `bun run tacit`） | 用几行字说出你正在看什么、像是想做什么、怎么来到这里 |
| 打开 [127.0.0.1:7766](http://127.0.0.1:7766) | 你的上下文资料库：读过的每一页、细读过的段落、怎么来的 |

[127.0.0.1:7777](http://127.0.0.1:7777) 上的 demo 站点有搜索引擎、长文章、信息流、仿 X 的时间线和代码仓库，可以离线把上面这些都试一遍。

**快捷键。** ⌥↵ 执行第一个建议。⌥1–3 执行其他建议；Tacit 询问时，选对应的选项。纸条展开时，直接按 1–3 就行。数字键就是字母上面那一排，任何笔记本都有，不需要数字小键盘。⌥⇧C 复制给 agent，⌥⇧F 专注于相关内容，⌥⇧Z 撤销，Esc 关闭。按住 ⌥ 就能看到提示。

## 模型和 key

- **不需要任何模型。** 默认情况下，Tacit 在你的电脑上用代码做判断，不需要 key，也不联网。
- **让 Jev 来判断。** [Jev](https://typesafe.ai) 是一个又小又快的判断模型，在难判断的页面上比代码准。有 [OpenRouter](https://openrouter.ai) key 的话，运行 `bun run keys set openrouter`：Jev 主判，另一家公司的判断模型做后备，Jev 拿不准的选择再交给一个对话模型复核。TypeSafe 的 key 也可以：`bun run keys set typesafe`。一次判断大约 0.00002 美元。连 OpenRouter 需要代理的地方，用 DeepSeek 的 key 不需要：`bun run keys set deepseek`。
- **检查一下：** `bun run models` 显示现在谁在判断；`bun run models --try` 用五道有标准答案的题问每个引擎，显示对了几道、多快、花了多少钱。
- **只在本机判断：** `ollama pull tev1`（4.6GB），然后 `TACIT_PRIVACY=local bun run harness`。即使设了云端 key，也只会询问这台电脑上的引擎。本地模型得证明自己有用：0.8B 的 `tev1:0.8b` 在 Tacit 的样例题上比代码还差，`bun run models --try` 会告诉你你的模型表现如何。
- **其他服务器**，只要支持 TypeSafe 的判断接口或 OpenAI 的对话接口，无论本地还是远程，都写进 `~/.tacit/models.json`：见 [docs/models.md](docs/models.md)（英文）。
- **你的 agent 自带模型。** Tacit 给它上下文：在需要时随提问附上一段说明，或者通过 `tacit` 命令、MCP。它从不调用大模型来写任何东西，所以没有别的需要配置或付费。任何 agent 都能用：[docs/agents.md](docs/agents.md)（英文）。
- **不用调参。** Tacit 会根据你保留了什么、撤销了什么来移动自己的门槛，面板里"学到的"会写清楚改了什么。唯一由你定的设置是：鼠标停多久才算细读。

哪些决定由代码做、哪些提前写好、哪些交给模型：见 [DESIGN.zh-CN.md](DESIGN.zh-CN.md#谁来决定)。

## 隐私由你掌控

- 在弹窗里可以全局暂停，或只在某个网站暂停。"永不读取"列表可以写网站，也可以写路径；密码管理器、Gmail 和 X 私信默认就在里面。
- 在面板里删掉一页或全部，扩展也会一起忘掉。
- Tacit 读什么、发到哪里，全都写在 [PRIVACY.md](PRIVACY.md)（英文）。

## 遇到问题

| 现象 | 试试 |
|---|---|
| 某个页面上没有那一行字 | 可能暂停了、在永不读取列表里，或者不是 `http(s)` 页面。弹窗里会显示原因。 |
| 弹窗显示"harness 未运行" | 在 tacit 文件夹里运行 `bun run harness`。如果它已经在运行，可能是系统代理没有放行 `127.0.0.1`，把它加进代理的绕过列表。 |
| 弹窗显示"还没有和 harness 配对" | 在 tacit 文件夹里运行 `bun run pair`，它会在浏览器里打开配对页。 |
| 判断一直不是 Jev 做的 | `bun run models --try` 会告诉你哪个引擎出错、为什么。如果要走代理，从设好代理的终端启动 harness，或在这样的终端里重新安装服务：`bun run service install`。 |
| agent 看不到 Tacit | 再运行一次 `bun run setup`，然后重启 agent。在 Claude Code 里，`claude mcp list` 应该能看到 `tacit`。在 Codex 里，到 `/hooks` 信任 Tacit 的钩子。`bun run agents:check` 会告诉你每个 agent 是否收得到说明。 |
| 那一行字猜错了 | 选中你在意的词，或者重新搜一次：你接下来做的事比之前的权重更高。Tacit 没把握时，会问你而不是乱猜。 |

## 推荐给别人

```text
Tacit 会读你正在看的页面和你是怎么来的，再交给你的 AI agent，从此不用再把整页复制粘贴进对话框。本地运行，开源：https://github.com/wujiajunhahah/tacit

想装的话，把这句话发给你的编程 agent："Set up Tacit on this computer. Read https://raw.githubusercontent.com/wujiajunhahah/tacit/main/docs/agent-setup.md and follow it step by step. Ask me only where it says so."
```
