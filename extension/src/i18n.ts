// Every string the user sees, in English and 简体中文. Packets for agents stay English.

export type Locale = 'en' | 'zh-CN';
export type LocalePref = 'auto' | Locale;

const en = {
  'line.ask': 'Looking for…',
  'verb.jump': 'Jump to',
  'verb.copy': 'Copy',
  'verb.open': 'Open',
  'verb.press': 'Press',
  'src.stated': 'you said',
  'src.search': 'from your search',
  'src.selection': 'from your selection',
  'src.copy': 'from what you copied',
  'src.read': 'from what you read closely',
  'src.click': 'from your click',
  'src.dwell': 'from your reading',
  'src.title': 'from this page',
  'feed.count': '{n} of {total} posts',
  'feed.none': 'nothing here',
  'passages.one': '1 passage',
  'passages.many': '{n} passages',
  'slip.nothing': 'Select or search something and Tacit will follow.',
  'slip.reads.one': 'Read closely: 1 passage',
  'slip.reads.many': 'Read closely: {n} passages',
  'tool.handoff': 'Copy for agent',
  'tool.focus': 'Focus',
  'tool.undo': 'Undo',
  'tool.pause': 'Pause',
  'tool.pause.title': 'Stop reading this site',
  'toast.jumped': 'Jumped to {x}',
  'toast.undo': 'Undo',
  'toast.undone': 'Undone',
  'toast.copied': 'Copied {x}',
  'toast.blocked': 'Clipboard blocked here',
  'toast.handoff': 'Copied for your agent · {tokens} tokens instead of {full}',
  'toast.saved': ' (−{pct}%)',
  'toast.handoffWith': 'Copied for your agent · {tokens} tokens, with how you got here',
  'toast.handoffBlocked': 'Clipboard blocked here · open the packet',
  'toast.showPacket': 'Show packet',
  'toast.focusOn': 'Focused on {x}',
  'toast.focusOff': 'Focus off',
  'toast.arrived': 'Arrived from a Tacit suggestion',
  'toast.back': 'Back',
  'fold.one': 'Folded 1 post · show',
  'fold.many': 'Folded {n} posts · show',
  'ago.now': 'just now',
  'ago.min': '{n} min ago',
  'ago.hour': '{n} h ago',
  'ago.day': '{n} d ago',
  'popup.lede': 'Reads the page and how you got here. Local by default.',
  'popup.checking': 'Checking the harness…',
  'popup.connected': 'Harness connected',
  'popup.offline': 'Harness offline',
  'popup.unpaired': 'Not paired with the harness',
  'popup.pairHint': 'In the tacit folder, run: bun run pair',
  'popup.engine': 'Decisions by {engine}{model}',
  'popup.local': 'Decisions stay on this machine',
  'popup.alone': 'The extension works alone; run the harness to share context with agents',
  'popup.read': 'Read pages',
  'popup.site': 'On {site}',
  'popup.pointer': 'Read with the pointer',
  'popup.pointer.sub': 'Where your pointer rests counts as reading closely. Longer means more important.',
  'popup.pointer.after': 'Counts after {s} s',
  'popup.language': 'Language',
  'popup.language.auto': 'Automatic',
  'popup.counts': '{n} visits in your trail',
  'popup.queued': ' · {n} waiting to sync',
  'popup.never': 'Never read these sites',
  'popup.never.sub': 'One per line. A path works too, like x.com/messages.',
  'popup.save': 'Save',
  'popup.saved': 'Saved',
  'popup.dashboard': 'Open dashboard',
  'popup.connect': 'Connect an agent',
  'popup.guide': 'How to use Tacit',
} as const;

export type Key = keyof typeof en;

const zh: Record<Key, string> = {
  'line.ask': '在找…',
  'verb.jump': '跳到',
  'verb.copy': '复制',
  'verb.open': '打开',
  'verb.press': '点击',
  'src.stated': '你说的',
  'src.search': '来自你的搜索',
  'src.selection': '来自你选中的文字',
  'src.copy': '来自你复制的内容',
  'src.read': '来自你细读的段落',
  'src.click': '来自你的点击',
  'src.dwell': '来自你的阅读',
  'src.title': '来自这个页面',
  'feed.count': '{total} 条里有 {n} 条',
  'feed.none': '这里没有相关内容',
  'passages.one': '1 段',
  'passages.many': '{n} 段',
  'slip.nothing': '选中或搜索点什么，Tacit 会跟上。',
  'slip.reads.one': '细读了 1 段',
  'slip.reads.many': '细读了 {n} 段',
  'tool.handoff': '复制给 agent',
  'tool.focus': '聚焦',
  'tool.undo': '撤销',
  'tool.pause': '暂停',
  'tool.pause.title': '不再读取这个网站',
  'toast.jumped': '已跳到 {x}',
  'toast.undo': '撤销',
  'toast.undone': '已撤销',
  'toast.copied': '已复制 {x}',
  'toast.blocked': '这里不允许写入剪贴板',
  'toast.handoff': '已复制给 agent · {tokens} 个 token，整页要 {full} 个',
  'toast.saved': '（省 {pct}%）',
  'toast.handoffWith': '已复制给 agent · {tokens} 个 token，带上了你是怎么来的',
  'toast.handoffBlocked': '这里不允许写入剪贴板 · 打开内容包',
  'toast.showPacket': '查看内容包',
  'toast.focusOn': '正在聚焦 {x}',
  'toast.focusOff': '已退出聚焦',
  'toast.arrived': '从 Tacit 的建议过来的',
  'toast.back': '返回',
  'fold.one': '折叠了 1 条 · 展开',
  'fold.many': '折叠了 {n} 条 · 展开',
  'ago.now': '刚刚',
  'ago.min': '{n} 分钟前',
  'ago.hour': '{n} 小时前',
  'ago.day': '{n} 天前',
  'popup.lede': '读页面，也读你是怎么来的。默认只留在本机。',
  'popup.checking': '正在检查 harness…',
  'popup.connected': 'harness 已连接',
  'popup.offline': 'harness 未运行',
  'popup.unpaired': '还没有和 harness 配对',
  'popup.pairHint': '在 tacit 文件夹里运行：bun run pair',
  'popup.engine': '由 {engine} 判断{model}',
  'popup.local': '判断只在本机进行',
  'popup.alone': '扩展可以单独使用；运行 harness，agent 才能读到上下文',
  'popup.read': '读取页面',
  'popup.site': '在 {site}',
  'popup.pointer': '用鼠标跟着读',
  'popup.pointer.sub': '鼠标停在哪段，就当你在细读哪段。停得越久越重要。',
  'popup.pointer.after': '停留 {s} 秒后计入',
  'popup.language': '语言',
  'popup.language.auto': '跟随浏览器',
  'popup.counts': '轨迹里有 {n} 次访问',
  'popup.queued': ' · {n} 条待同步',
  'popup.never': '永不读取这些网站',
  'popup.never.sub': '每行一个，也可以写路径，比如 x.com/messages。',
  'popup.save': '保存',
  'popup.saved': '已保存',
  'popup.dashboard': '打开面板',
  'popup.connect': '连接 agent',
  'popup.guide': 'Tacit 怎么用',
};

const TABLES: Record<Locale, Record<Key, string>> = { en, 'zh-CN': zh };
let current: Locale = 'en';

export function detectLocale(pref: LocalePref = 'auto'): Locale {
  if (pref !== 'auto') return pref;
  const ui = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : '';
  const lang = (ui || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en').toLowerCase();
  return lang.startsWith('zh') ? 'zh-CN' : 'en';
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const s = TABLES[current][key] ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** Pick the singular or plural key. */
export function tn(one: Key, many: Key, n: number, vars: Record<string, string | number> = {}): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return t('ago.now');
  const m = Math.round(s / 60);
  if (m < 60) return t('ago.min', { n: m });
  const h = Math.round(m / 60);
  return h < 24 ? t('ago.hour', { n: h }) : t('ago.day', { n: Math.round(h / 24) });
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
export const hasCJK = (s: string) => CJK.test(s);

/** Chinese quotes for Chinese UI, curly quotes otherwise. */
export function quote(s: string): string {
  return current === 'zh-CN' ? `「${s}」` : `“${s}”`;
}

export const i18nForTest = { en, zh };
