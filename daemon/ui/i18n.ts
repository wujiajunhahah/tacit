// Every string the dashboard shows, in English and 简体中文. A missing translation fails tsc.

export type Locale = 'en' | 'zh-CN';

const en = {
  'brand.sub': 'context library',
  'skip': 'Skip to content',
  'nav.label': 'Sections',
  'nav.now': 'Now',
  'nav.library': 'Library',
  'nav.trail': 'Trail',
  'nav.learned': 'Learned',
  'nav.connect': 'Connect',
  'nav.privacy': 'Privacy',
  'lang.switch': '中文',
  'lang.label': 'Show the dashboard in Chinese',
  'status.local': 'local engine',
  'status.pages.one': '{n} page',
  'status.pages.other': '{n} pages',
  'status.offline': 'harness unreachable · start it with “bun run harness”',
  'status.locked': 'locked · open it from the Tacit popup',
  'colophon.local': 'Everything here lives on this machine.',
  'colophon.cloud': 'Everything here lives on this machine; only decision requests go out, to {hosts}.',
  'colophon.guide': 'How to use Tacit',
  'common.copy': 'Copy',
  'common.copied': 'Copied',
  'common.copyFailed': 'The browser blocked the clipboard.',
  'common.cancel': 'Cancel',
  'common.open': 'Open the original page',
  'common.error': 'Something went wrong. Is the harness still running?',
  'common.locked': 'This dashboard is locked. Open it from the Tacit popup (Open dashboard), or run “bun run pair” in the tacit folder.',
  'common.hint': 'Press / to search',

  'time.justNow': 'just now',
  'time.min': '{n} min ago',
  'time.h': '{n} h ago',
  'time.d': '{n} d ago',
  'day.today': 'Today',
  'day.yesterday': 'Yesterday',
  'dur.s': '{n} s',
  'dur.min': '{n} min',
  'dur.h': '{h} h',
  'dur.hmin': '{h} h {m} min',

  'ev.stated': 'you said',
  'ev.search': 'searched',
  'ev.copy': 'copied',
  'ev.selection': 'selected',
  'ev.read': 'read closely',
  'ev.click': 'clicked',
  'ev.dwell': 'read',
  'ev.title': 'reading',

  'intent.none': 'No clear goal yet',
  'intent.inferred': 'inferred',
  'intent.stated': 'you said so',
  'intent.others': 'Or perhaps',

  'arr.search': 'searched {q}',
  'arr.on': 'on {from}',
  'arr.via': 'clicked {via}',
  'arr.from': 'from {from}',
  'arr.link': 'followed a link',
  'arr.tacit': 'Tacit suggested this page',
  'arr.typed': 'typed the address',
  'arr.bookmark': 'opened a bookmark',
  'arr.back': 'came back to it',
  'arr.reload': 'reloaded the page',
  'arr.newTab': 'opened from {from} in a new tab',
  'arr.newTabPlain': 'opened in a new tab',
  'arr.direct': 'opened it directly',

  'state.suggested': 'Suggested',
  'state.confirmed': 'Confirmed',
  'state.executed': 'Done',
  'state.undone': 'Undone',
  'state.dismissed': 'Dismissed',

  'now.title': 'Now',
  'now.reading': 'Reading',
  'now.copy': 'Copy for agent',
  'now.copied': 'Copied. Paste it into your agent.',
  'now.cost': '~{tokens} tokens · {pct} less than the whole page',
  'now.costPlain': '~{tokens} tokens',
  'now.waiting': 'Waiting for the page text…',
  'now.emptyTitle': 'Nothing here yet',
  'now.emptyBody':
    'Load the Tacit extension in Chrome (chrome://extensions → Developer mode → Load unpacked → the extension folder), then read anything. What you read shows up here, and it stays on this machine.',

  'lib.title': 'Library',
  'lib.search': 'Search what you have read',
  'lib.placeholder': 'A word or a phrase, in any language',
  'lib.site': 'Site',
  'lib.allSites': 'All sites',
  'lib.sort': 'Order',
  'lib.sort.relevance': 'Best match',
  'lib.sort.recent': 'Recent',
  'lib.sort.attention': 'Most read',
  'lib.count.one': '{n} page',
  'lib.count.other': '{n} pages',
  'lib.matches.one': '{n} page matches',
  'lib.matches.other': '{n} pages match',
  'lib.read': 'read {d}',
  'lib.reads.one': '{n} passage read closely',
  'lib.reads.other': '{n} passages read closely',
  'lib.selections.one': '{n} selection',
  'lib.selections.other': '{n} selections',
  'lib.visits.one': '{n} visit',
  'lib.visits.other': '{n} visits',
  'lib.more': 'Show more',
  'lib.emptyTitle': 'Your library fills itself as you read',
  'lib.emptyBody':
    'Every page you open with the extension on lands here, with the passages you lingered on and the words you selected. Nothing to file, nothing to tag.',
  'lib.none': 'Nothing you have read matches {q}.',
  'lib.noneSite': 'No pages from this site yet.',

  'page.back': 'Library',
  'page.first': 'first read {date}',
  'page.last': 'last read {ago}',
  'page.after': 'You seemed to be after {intent}',
  'page.copy': 'Copy for agent',
  'page.delete': 'Delete this page',
  'page.confirmText': 'Delete this page, its {visits} and what Tacit did here? This cannot be undone.',
  'page.confirm': 'Delete',
  'page.deleted': 'Deleted. Tacit has forgotten this page.',
  'page.reads': 'Read closely',
  'page.readsNote': 'The passages that held your attention, in page order.',
  'page.readsEmpty': 'No passage has held your attention long enough yet.',
  'page.viaPointer': 'under the pointer',
  'page.viaView': 'in view',
  'page.words': 'Your words',
  'page.wordsEmpty': 'You haven’t selected or copied anything here.',
  'page.selected': 'selected',
  'page.copied': 'copied',
  'page.arrivals': 'How you got here',
  'page.actions': 'What Tacit did here',
  'page.actionsEmpty': 'Nothing yet.',
  'page.outline': 'Outline',
  'page.missing': 'Tacit has no record of this page. It may have been deleted.',

  'trail.title': 'Trail',
  'trail.emptyTitle': 'Your trail draws itself as you browse',
  'trail.emptyBody': 'Every visit shows up here, grouped into sittings, with how you got there and what you did.',
  'trail.now': 'now',
  'trail.read': 'read {d}',
  'trail.scrolled': 'scrolled {pct}',
  'trail.copies.one': '{n} copy',
  'trail.copies.other': '{n} copies',

  'learned.title': 'Learned',
  'learned.intro': 'Tacit tunes itself from what you keep and what you undo.',
  'learned.when': 'When Tacit acts',
  'learned.act': 'Offers to act, one key away, above {pct} confidence.',
  'learned.suggest': 'Suggests above {pct}, and asks you below that.',
  'learned.changes': 'What it changed',
  'learned.actRaised': 'Acting less eagerly ({from} → {to}): you undid {undone} of {total} confident actions.',
  'learned.actLowered': 'Acting a little sooner ({from} → {to}): {kept} of {total} confident actions stuck.',
  'learned.foldsOff': 'Stopped folding on {domain}: you unfolded {dismissed} of the last {total} times.',
  'learned.none': 'Nothing to adjust yet. Tacit starts from its defaults and changes them only when what you do says so.',
  'learned.keptActions.one': '{n} action you kept',
  'learned.keptActions.other': '{n} actions you kept',
  'learned.keptFolds.one': '{n} fold you left alone',
  'learned.keptFolds.other': '{n} folds you left alone',
  'learned.sample': 'From {actions}, {undone} you undid, {folds} and {opened} you opened.',

  'connect.title': 'Connect',
  'connect.intro':
    'Any agent can read what you are reading: by running a command, from a note added before a prompt that needs it, or through five read-only tools. Nothing leaves this machine until your agent reads it.',
  'connect.any': 'Any agent with a terminal',
  'connect.anyHow':
    'Codex, Gemini CLI, OpenCode, Claude Code and the rest can run tacit. Put this line in the agent’s instructions (AGENTS.md, GEMINI.md, CLAUDE.md). It costs under 50 tokens a request, and the agent runs tacit only when it needs to.',
  'connect.hooks':
    'bun run setup also gives Claude Code, Codex, Gemini CLI and OpenCode a prompt hook: before a prompt that builds on your screen, and only then, the agent gets a short note about it.',
  'connect.claude': 'Claude Code, with tools',
  'connect.claudeHow': 'Run this once in a terminal. It adds Tacit’s tools to every project.',
  'connect.other': 'Cursor, Claude Desktop, Windsurf and other MCP clients',
  'connect.otherHow': 'Add this to the client’s MCP config.',
  'connect.try': 'Then ask: {q}',
  'connect.tryQ': 'what’s the main point of the page I’m reading?',
  'connect.tools': 'What your agent can read',
  'connect.tool.current': 'the page you are on, as a compact packet',
  'connect.tool.intent': 'what you seem to be doing, and the evidence',
  'connect.tool.trail': 'where you have been, and how you got there',
  'connect.tool.search': 'everything you have read, in any language',
  'connect.tool.page': 'one page in full, with what you read closely',
  'connect.decisions': 'Decisions',
  'connect.local': 'The code engine decides, on this machine. To let Jev decide, add a key: bun run keys set openrouter (or typesafe).',
  'connect.chain': 'Asked in this order, the next one when one fails or is slow: {chain}.',
  'connect.code': 'the code engine',
  'connect.escalate': 'A choice the first answer is unsure of goes to {engine} again, and the surer answer stands.',
  'connect.kept': 'Kept on this machine: engines elsewhere are not asked.',
  'connect.noKey': 'Not asked until a key is set: {list}.',
  'connect.private': 'Not asked, because decisions stay on this machine: {list}.',
  'connect.problem': '{problem}. Until it is fixed, the code engine decides, on this machine.',
  'connect.last': 'The latest decision: {engine}, in {ms} ms.',
  'connect.config': 'Who decides is set in {path}.',

  'privacy.title': 'Privacy',
  'privacy.where': 'Everything Tacit has recorded is in {path} on this machine, {size} in all.',
  'privacy.local': 'Nothing is sent anywhere.',
  'privacy.cloud': 'Only decision requests go out, to {hosts}: what you seem to be after, the page’s title and address, and the options being weighed.',
  'privacy.counts': '{pages}, {visits} and {actions}.',
  'privacy.actions.one': '{n} action',
  'privacy.actions.other': '{n} actions',
  'privacy.extension': 'The extension keeps its own copy of your last 300 visits in the browser. What you delete here, it forgets the next time it reaches the harness.',
  'privacy.delete': 'Delete everything…',
  'privacy.confirmText': 'This deletes {pages}, {visits} and {actions} from this machine. It cannot be undone.',
  'privacy.confirm': 'Delete everything',
  'privacy.done': 'Everything is deleted. Tacit starts fresh with the next page you open.',
  'privacy.policy': 'Read the privacy policy',
  'privacy.empty': 'Tacit has not recorded anything yet.',
};

export type Key = keyof typeof en;

const zh: Record<Key, string> = {
  'brand.sub': '上下文资料库',
  'skip': '跳到正文',
  'nav.label': '栏目',
  'nav.now': '此刻',
  'nav.library': '资料库',
  'nav.trail': '轨迹',
  'nav.learned': '学到的',
  'nav.connect': '连接',
  'nav.privacy': '隐私',
  'lang.switch': 'English',
  'lang.label': '用英文显示',
  'status.local': '本地引擎',
  'status.pages.one': '{n} 个页面',
  'status.pages.other': '{n} 个页面',
  'status.offline': '连不上 harness · 用 “bun run harness” 启动',
  'status.locked': '已锁定 · 请从 Tacit 弹窗打开',
  'colophon.local': '这里的一切都只在这台电脑上。',
  'colophon.cloud': '这里的一切都只在这台电脑上；只有判断请求会发出去，发往 {hosts}。',
  'colophon.guide': 'Tacit 怎么用',
  'common.copy': '复制',
  'common.copied': '已复制',
  'common.copyFailed': '浏览器拦住了剪贴板。',
  'common.cancel': '取消',
  'common.open': '打开原网页',
  'common.error': '出了点问题。harness 还在运行吗？',
  'common.locked': '面板已锁定。请从 Tacit 弹窗点「打开面板」，或在 tacit 文件夹里运行 “bun run pair”。',
  'common.hint': '按 / 开始搜索',

  'time.justNow': '刚刚',
  'time.min': '{n} 分钟前',
  'time.h': '{n} 小时前',
  'time.d': '{n} 天前',
  'day.today': '今天',
  'day.yesterday': '昨天',
  'dur.s': '{n} 秒',
  'dur.min': '{n} 分钟',
  'dur.h': '{h} 小时',
  'dur.hmin': '{h} 小时 {m} 分钟',

  'ev.stated': '你说',
  'ev.search': '搜索了',
  'ev.copy': '复制了',
  'ev.selection': '选中了',
  'ev.read': '细读了',
  'ev.click': '点击了',
  'ev.dwell': '读了',
  'ev.title': '正在看',

  'intent.none': '还看不出你想做什么',
  'intent.inferred': '推断',
  'intent.stated': '你说的',
  'intent.others': '也可能是',

  'arr.search': '搜索了 {q}',
  'arr.on': '在 {from}',
  'arr.via': '点了 {via}',
  'arr.from': '从 {from}',
  'arr.link': '点链接进来',
  'arr.tacit': 'Tacit 推荐了这页',
  'arr.typed': '直接输入了网址',
  'arr.bookmark': '打开了书签',
  'arr.back': '返回到这页',
  'arr.reload': '刷新了页面',
  'arr.newTab': '从 {from} 在新标签页打开',
  'arr.newTabPlain': '在新标签页打开',
  'arr.direct': '直接打开',

  'state.suggested': '建议',
  'state.confirmed': '已确认',
  'state.executed': '已完成',
  'state.undone': '已撤销',
  'state.dismissed': '已忽略',

  'now.title': '此刻',
  'now.reading': '正在读',
  'now.copy': '复制给 agent',
  'now.copied': '已复制，直接粘贴给你的 agent。',
  'now.cost': '约 {tokens} 个 token · 比整页少 {pct}',
  'now.costPlain': '约 {tokens} 个 token',
  'now.waiting': '正在等页面内容…',
  'now.emptyTitle': '这里还什么都没有',
  'now.emptyBody':
    '在 Chrome 里加载 Tacit 扩展（chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → extension 文件夹），然后随便读点什么。你读的内容会出现在这里，并且只留在这台电脑上。',

  'lib.title': '资料库',
  'lib.search': '搜索你读过的内容',
  'lib.placeholder': '一个词或一句话，中英文都行',
  'lib.site': '网站',
  'lib.allSites': '所有网站',
  'lib.sort': '排序',
  'lib.sort.relevance': '最相关',
  'lib.sort.recent': '最近',
  'lib.sort.attention': '读得最多',
  'lib.count.one': '{n} 个页面',
  'lib.count.other': '{n} 个页面',
  'lib.matches.one': '{n} 个页面匹配',
  'lib.matches.other': '{n} 个页面匹配',
  'lib.read': '读了 {d}',
  'lib.reads.one': '细读 {n} 段',
  'lib.reads.other': '细读 {n} 段',
  'lib.selections.one': '{n} 处选中',
  'lib.selections.other': '{n} 处选中',
  'lib.visits.one': '{n} 次访问',
  'lib.visits.other': '{n} 次访问',
  'lib.more': '显示更多',
  'lib.emptyTitle': '你读的时候，资料库会自己填满',
  'lib.emptyBody': '开着扩展打开的每个页面都会出现在这里，连同你停留过的段落和选中的文字。不用归档，也不用打标签。',
  'lib.none': '你读过的内容里，没有和 {q} 相关的。',
  'lib.noneSite': '这个网站还没有页面。',

  'page.back': '资料库',
  'page.first': '首次阅读 {date}',
  'page.last': '最近阅读 {ago}',
  'page.after': '你当时像是在找 {intent}',
  'page.copy': '复制给 agent',
  'page.delete': '删除这页',
  'page.confirmText': '删除这页、它的 {visits}，以及 Tacit 在这里做过的事？删除后无法恢复。',
  'page.confirm': '删除',
  'page.deleted': '已删除，Tacit 忘掉了这页。',
  'page.reads': '细读过的段落',
  'page.readsNote': '让你停下来的段落，按页面顺序排列。',
  'page.readsEmpty': '还没有哪一段让你停留得足够久。',
  'page.viaPointer': '鼠标停留',
  'page.viaView': '停在屏幕上',
  'page.words': '你留下的文字',
  'page.wordsEmpty': '你还没在这页选中或复制过什么。',
  'page.selected': '选中',
  'page.copied': '复制',
  'page.arrivals': '你是怎么来的',
  'page.actions': 'Tacit 在这里做过的事',
  'page.actionsEmpty': '还没有。',
  'page.outline': '大纲',
  'page.missing': 'Tacit 没有这页的记录，可能已经删除了。',

  'trail.title': '轨迹',
  'trail.emptyTitle': '你浏览时，轨迹会自己画出来',
  'trail.emptyBody': '每次访问都会出现在这里，按一次次的阅读分组，连同你是怎么来的、做了什么。',
  'trail.now': '现在',
  'trail.read': '读了 {d}',
  'trail.scrolled': '滚动到 {pct}',
  'trail.copies.one': '复制 {n} 次',
  'trail.copies.other': '复制 {n} 次',

  'learned.title': '学到的',
  'learned.intro': 'Tacit 会根据你保留了什么、撤销了什么来调整自己。',
  'learned.when': 'Tacit 什么时候出手',
  'learned.act': '把握超过 {pct} 时，按一下就执行。',
  'learned.suggest': '超过 {pct} 时给建议，低于这个就问你。',
  'learned.changes': '调整了什么',
  'learned.actRaised': '更谨慎了（{from} → {to}）：{total} 次有把握的动作里，你撤销了 {undone} 次。',
  'learned.actLowered': '稍微果断了一点（{from} → {to}）：{total} 次有把握的动作里，你保留了 {kept} 次。',
  'learned.foldsOff': '在 {domain} 不再折叠：最近 {total} 次里你展开了 {dismissed} 次。',
  'learned.none': '还没有需要调整的。Tacit 先用默认值，只有你的操作表明需要时才会改。',
  'learned.keptActions.one': '你保留的 {n} 个动作',
  'learned.keptActions.other': '你保留的 {n} 个动作',
  'learned.keptFolds.one': '你留下的 {n} 次折叠',
  'learned.keptFolds.other': '你留下的 {n} 次折叠',
  'learned.sample': '依据：{actions}，撤销的 {undone} 个；{folds}，展开的 {opened} 次。',

  'connect.title': '连接',
  'connect.intro': '任何 agent 都能读到你正在看的内容：运行一条命令，在需要时随提问附上一段说明，或者通过五个只读工具。在 agent 读取之前，什么都不会离开这台电脑。',
  'connect.any': '任何能用终端的 agent',
  'connect.anyHow': 'Codex、Gemini CLI、OpenCode、Claude Code 等都能运行 tacit。把这一行加进 agent 的说明文件（AGENTS.md、GEMINI.md、CLAUDE.md）：每次请求不到 50 个 token，agent 只在需要时才运行 tacit。',
  'connect.hooks': 'bun run setup 还会给 Claude Code、Codex、Gemini CLI 和 OpenCode 装上提示钩子：只有当提问要用到你屏幕上的内容时，agent 才会先收到一段简短说明。',
  'connect.claude': 'Claude Code，用工具',
  'connect.claudeHow': '在终端里运行一次，所有项目都能用上 Tacit 的工具。',
  'connect.other': 'Cursor、Claude Desktop、Windsurf 等 MCP 客户端',
  'connect.otherHow': '把这段加进客户端的 MCP 配置。',
  'connect.try': '然后问它：{q}',
  'connect.tryQ': '我正在看的这页讲了什么？',
  'connect.tools': '你的 agent 能读到什么',
  'connect.tool.current': '你正在看的页面，打包成精简的上下文',
  'connect.tool.intent': '你看起来在做什么，以及依据',
  'connect.tool.trail': '你去过哪里，是怎么去的',
  'connect.tool.search': '你读过的一切，中英文都能搜',
  'connect.tool.page': '某一页的全文，以及你细读过的段落',
  'connect.decisions': '判断',
  'connect.local': '由代码引擎在这台电脑上做判断。想让 Jev 来判断，加一个 key：bun run keys set openrouter（或 typesafe）。',
  'connect.chain': '按这个顺序询问，前一个出错或太慢时问下一个：{chain}。',
  'connect.code': '代码引擎',
  'connect.escalate': '第一个答案拿不准的选择，会再问一次 {engine}，留下更有把握的那个。',
  'connect.kept': '只在本机判断：不会询问本机以外的引擎。',
  'connect.noKey': '设置 key 之前不会询问：{list}。',
  'connect.private': '因为判断只在本机进行，不会询问：{list}。',
  'connect.problem': '{problem}。修好之前，由代码引擎在本机判断。',
  'connect.last': '最近一次判断：{engine}，用时 {ms} 毫秒。',
  'connect.config': '谁来判断，在 {path} 里设置。',

  'privacy.title': '隐私',
  'privacy.where': 'Tacit 记录的一切都在这台电脑的 {path} 里，共 {size}。',
  'privacy.local': '不会发到任何地方。',
  'privacy.cloud': '只有判断请求会发出去，发往 {hosts}：你像是在找什么、页面的标题和地址，以及正在比较的选项。',
  'privacy.counts': '{pages}、{visits}、{actions}。',
  'privacy.actions.one': '{n} 个动作',
  'privacy.actions.other': '{n} 个动作',
  'privacy.extension': '扩展在浏览器里另存了最近 300 次访问。你在这里删除的内容，它下次连上 harness 时也会忘掉。',
  'privacy.delete': '删除全部…',
  'privacy.confirmText': '这会从这台电脑上删除 {pages}、{visits} 和 {actions}，无法恢复。',
  'privacy.confirm': '全部删除',
  'privacy.done': '已全部删除。Tacit 会从你打开的下一个页面重新开始。',
  'privacy.policy': '阅读隐私政策',
  'privacy.empty': 'Tacit 还没有记录任何东西。',
};

export const STRINGS: Record<Locale, Record<Key, string>> = { en, 'zh-CN': zh };

/** Keys that come in `.one` / `.other` pairs. */
export type PluralKey = { [K in Key]: K extends `${infer B}.one` ? B : never }[Key];

type Vars = Record<string, string | number>;
export type Part = Node | string;

const STORAGE_KEY = 'tacit.locale';
let locale: Locale = 'en';

export function getLocale(): Locale {
  return locale;
}

export function detectLocale(stored: string | null, language: string): Locale {
  if (stored === 'en' || stored === 'zh-CN') return stored;
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function initLocale(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be off; the browser language still decides.
  }
  locale = detectLocale(stored, navigator.language);
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not remembered, still applied.
  }
}

export function t(key: Key, vars: Vars = {}): string {
  return STRINGS[locale][key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function tn(base: PluralKey, n: number, vars: Vars = {}): string {
  return t(`${base}.${n === 1 ? 'one' : 'other'}` as Key, { n: num(n), ...vars });
}

/** Like t(), but placeholders may be nodes, so the user's own words keep their typography. */
export function tx(key: Key, vars: Record<string, Part | Part[]>): Part[] {
  const s = STRINGS[locale][key];
  const out: Part[] = [];
  let last = 0;
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    out.push(s.slice(last, m.index));
    const v = vars[m[1]!];
    if (Array.isArray(v)) out.push(...v);
    else out.push(v ?? m[0]);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(s.slice(last));
  return out.filter((p) => p !== '');
}

export const num = (n: number): string => new Intl.NumberFormat(locale).format(n);
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return t('time.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return t('time.min', { n: m });
  const h = Math.round(m / 60);
  return h < 24 ? t('time.h', { n: h }) : t('time.d', { n: Math.round(h / 24) });
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return t('dur.s', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('dur.min', { n: m });
  const h = Math.floor(m / 60);
  return m % 60 ? t('dur.hmin', { h, m: m % 60 }) : t('dur.h', { h });
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function date(ts: number): string {
  return new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export function day(ts: number, now = Date.now()): string {
  const d = new Date(ts).toDateString();
  if (d === new Date(now).toDateString()) return t('day.today');
  if (d === new Date(now - 86_400_000).toDateString()) return t('day.yesterday');
  return date(ts);
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${num(Math.max(1, Math.round(n / 1024)))} KB`;
  return `${(n / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
