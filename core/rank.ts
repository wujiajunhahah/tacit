// Ranking what is on a page against what the user is trying to do.

import { buildIndex, scoreDoc } from './bm25';
import { clip, softmax, tokenize } from './text';
import type { Action, Block, Intent, Ranked, Region } from './types';

const REGION_PRIOR: Record<Region, number> = { main: 0.5, unknown: 0, aside: -0.3, header: -0.6, nav: -0.6, footer: -1 };
const NOISE_LABEL =
  /^(sign ?in|log ?in|sign ?up|register|cookie|privacy|terms|accept|subscribe|menu|skip to|share|登录|注册|隐私|条款|分享)/i;

/** Sections that point elsewhere rather than answer anything. */
const BOILERPLATE = /^(related( reading| posts| articles)?|further reading|see also|references?|footnotes?|notes|read more|recommended|popular posts|more from|comments?|share|相关阅读|延伸阅读|推荐阅读|参考资料|参考文献|参考|注释|评论)\b/i;
const BOILERPLATE_DAMP = 0.25;

/** Score below which "none of these" wins. Tuned so a single weak context match asks instead of acting. */
export const NONE_SCORE = 1.6;
const ACTION_TEMPERATURE = 1.25;
/** On-page jumps are reversible and the user already chose this page, so they win close calls. */
const JUMP_PRIOR = 2.0;
/** Copying a command is the shortest path from intent to done, when the intent is to do something. */
const COPY_PRIOR = { doing: 2.4, knowing: 0.6 };
const DOING = new Set(
  'install installation setup run start deploy build configure config init command cli try launch upgrade 安装 运行 部署 配置 命令 启动 升级'.split(' '),
);

export function wantsToDo(intent: Intent): boolean {
  return Object.keys(intent.terms).some((t) => DOING.has(t));
}

function hasQuery(intent: Intent): boolean {
  return Object.keys(intent.terms).length > 0;
}

function reasonsFor(matched: [string, number][], section?: string, sectionTokens?: Set<string>): string[] {
  const terms = matched.slice(0, 3).map(([t]) => t);
  const reasons = terms.length ? [`matches ${terms.map((t) => `“${t}”`).join(', ')}`] : [];
  if (section && sectionTokens && matched.some(([t]) => sectionTokens.has(t))) reasons.push(`in “${clip(section, 40)}”`);
  return reasons;
}

/** Every block with its relevance to the intent, in page order. */
export function rankBlocks(blocks: Block[], intent: Intent): Ranked<Block>[] {
  if (blocks.length === 0 || !hasQuery(intent)) {
    return blocks.map((b) => ({ item: b, score: 0, p: 0, relevance: 0, reasons: [] }));
  }
  const sectionTokens = blocks.map((b) => tokenize(b.section));
  const docs = blocks.map((b, i) => [...tokenize(b.text), ...(sectionTokens[i] ?? [])]);
  const index = buildIndex(docs);
  const hits = blocks.map((_, i) => scoreDoc(index, i, intent.terms));
  const scores = hits.map((h, i) => {
    const b = blocks[i]!;
    const damp = b.kind === 'heading' ? 0.6 : b.text.length < 40 ? 0.5 : 1;
    return h.score * damp * (BOILERPLATE.test(b.section.trim()) ? BOILERPLATE_DAMP : 1);
  });
  const max = Math.max(0, ...scores);
  const probs = softmax(scores, Math.max(1, max / 4));
  return blocks.map((b, i) => ({
    item: b,
    score: scores[i] ?? 0,
    p: probs[i] ?? 0,
    relevance: max > 0 ? (scores[i] ?? 0) / max : 0,
    reasons: reasonsFor(hits[i]?.matched ?? [], b.section, new Set(sectionTokens[i])),
  }));
}

/** The k most relevant blocks, best first. */
export function topBlocks(ranked: Ranked<Block>[], k: number, minRelevance = 0.35): Ranked<Block>[] {
  return ranked
    .filter((r) => r.score > 0 && r.relevance >= minRelevance && r.item.kind !== 'heading')
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** "Jump to" actions for the best sections, so an answer is one keystroke away. */
export function jumpActions(ranked: Ranked<Block>[], k = 2): Action[] {
  const out: Action[] = [];
  const seen = new Set<string>();
  for (const r of topBlocks(ranked, 12, 0.5)) {
    const key = r.item.section || r.item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const target = r.item.section ? r.item.section : r.item.text;
    out.push({
      id: `jump:${r.item.id}`,
      kind: 'jump',
      label: `Jump to “${clip(target, 48)}”`,
      context: clip(r.item.text, 220),
      region: 'main',
      targetBlockId: r.item.id,
    });
    if (out.length >= k) break;
  }
  return out;
}

export interface ActionRanking {
  ranked: Ranked<Action>[];
  /** Probability that none of the candidates is what the user wants. */
  none: number;
  confidence: number;
}

export function rankActions(actions: Action[], intent: Intent, topK = 8): ActionRanking {
  const usable = actions.filter((a) => a.label.trim().length >= 2);
  if (usable.length === 0 || !hasQuery(intent)) return { ranked: [], none: 1, confidence: 0 };

  const docs = usable.map((a) => {
    const label = tokenize(a.label);
    return [...label, ...label, ...tokenize(a.context)];
  });
  const index = buildIndex(docs);
  const copyPrior = wantsToDo(intent) ? COPY_PRIOR.doing : COPY_PRIOR.knowing;
  const scored = usable
    .map((a, i) => {
      const hit = scoreDoc(index, i, intent.terms);
      let s = hit.score;
      if (s > 0) {
        s += REGION_PRIOR[a.region];
        if (a.kind === 'jump') s += JUMP_PRIOR;
        if (a.kind === 'copy') s += copyPrior;
        if (a.visited) s -= 0.6;
        if (NOISE_LABEL.test(a.label.trim())) s -= 1.5;
      }
      return { a, s: Math.max(0, s), hit };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s)
    .slice(0, topK);

  const probs = softmax([...scored.map((x) => x.s), NONE_SCORE], ACTION_TEMPERATURE);
  const none = probs[probs.length - 1] ?? 1;
  const best = scored[0]?.s ?? 1;
  const ranked = scored.map((x, i) => ({
    item: x.a,
    score: x.s,
    p: probs[i] ?? 0,
    relevance: x.s / best,
    reasons: reasonsFor(x.hit.matched),
  }));
  return { ranked, none, confidence: ranked[0]?.p ?? 0 };
}
