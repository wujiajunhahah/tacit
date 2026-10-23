// Tokenizing mixed Chinese and English text for relevance scoring.

const EN_STOP = new Set(
  (
    'a an the and or but if then else of to in on at by for with from as is are was were be been being it its ' +
    'this that these those i you he she we they me him her us them my your his our their what which who whom ' +
    'how why when where do does did done have has had not no yes so too very can could should would will just ' +
    'about into over under than more most some any all each other such only own same also there here up down ' +
    'out off again once now via vs etc get got one new use using used like may might must shall let make made ' +
    'many much even still yet back see way well per www http https com html org net amp nbsp'
  ).split(' '),
);

const ZH_STOP = new Set(
  (
    '的 了 是 在 我 有 和 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这 那 这个 那个 ' +
    '什么 怎么 怎样 我们 你们 他们 她们 它们 它 他 她 吗 吧 呢 啊 呀 哦 嗯 与 及 或 而 但 但是 如果 因为 ' +
    '所以 可以 可能 就是 还是 而且 以及 对 把 被 让 给 从 向 为 为了 于 之 其 此 等 等等 中 里 下 后 前 ' +
    '时 时候 现在 已经 还 又 再 才 只 最 更 太 比较 非常 一些 一下 一样 这样 那样 这些 那些 没 不是 也是 ' +
    '是否 怎么样 哪 哪些 哪里 谁 多少 几 个 次 地 得 过 来'
  ).split(' '),
);

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const segmenter: Intl.Segmenter | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

function keep(token: string): string | null {
  if (!token) return null;
  if (CJK.test(token)) return ZH_STOP.has(token) ? null : token;
  if (token.length < 2 || EN_STOP.has(token)) return null;
  return stem(token);
}

function fallbackSegments(text: string): string[] {
  const out: string[] = [];
  for (const run of text.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (!CJK.test(run)) {
      out.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
    if (run.length === 1) out.push(run);
  }
  return out;
}

/** Lowercased, stop-word-free tokens. Chinese is segmented into words. */
export function tokenize(text: string): string[] {
  const normalized = text.normalize('NFKC').toLowerCase();
  const raw = segmenter
    ? [...segmenter.segment(normalized)].filter((s) => s.isWordLike).map((s) => s.segment.trim())
    : fallbackSegments(normalized);
  const tokens: string[] = [];
  for (const r of raw) {
    const t = keep(r);
    if (t) tokens.push(t);
  }
  return tokens;
}

/** A title, then a separator, then the site's name: "Human–computer interaction - Wikipedia". */
const TITLE_AND_SITE = /^(.{8,}?)\s+(?:[-|–—·:]|::)\s+([^-|–—·]{1,32})$/;

/** "Human–computer interaction - Wikipedia" → "Human–computer interaction". */
export function cleanTitle(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  const m = flat.match(TITLE_AND_SITE);
  return m ? m[1]!.trim() : flat;
}

/** Parts of an address that name no site. */
const ADDRESS_WORDS = new Set(['www', 'com', 'net', 'org', 'edu', 'gov', 'app', 'dev', 'info', 'biz', 'mobile', 'localhost']);

/**
 * The words that name the site itself, from its address and the end of its titles: hkust on hkust.edu.hk, wikipedia
 * on Wikipedia. On that site they say nothing about which page or passage you want, since all of it is the site.
 */
export function siteTerms(domain: string, title = ''): Set<string> {
  const out = new Set<string>();
  for (const label of domain.toLowerCase().split('.')) {
    if (label.length > 2 && !ADDRESS_WORDS.has(label) && !/^\d+$/.test(label)) for (const t of tokenize(label)) out.add(t);
  }
  const site = title.replace(/\s+/g, ' ').trim().match(TITLE_AND_SITE)?.[2];
  if (site) for (const t of tokenize(site)) out.add(t);
  return out;
}

/** Collapse whitespace and cut to a length, ending on a word boundary when possible. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** Rough token count: one per CJK character, ~1.3 per Latin word. */
export function estimateTokens(text: string): number {
  let cjk = 0;
  for (const ch of text) if (CJK.test(ch)) cjk++;
  const latinWords = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;
  const symbols = text.match(/[^\sA-Za-z0-9\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  return cjk + Math.ceil(latinWords * 1.3) + Math.ceil(symbols * 0.3);
}

export function softmax(scores: number[], temperature = 1): number[] {
  if (scores.length === 0) return [];
  const t = Math.max(temperature, 1e-6);
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / t));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
