// Who decides on this machine, and how each engine does on a few of Tacit's own questions.
// Usage:
//   bun run models                      the chain, from models.json and the keys
//   bun run models --try                each engine in the chain on the samples: right answers, latency, cost
//   bun run models --try openai/gpt-6-luna systemone:perplexity/pplx-decider-flash-v1.2
//                                       OpenRouter models instead (chat, or System One with the prefix), to pick one
// The samples have clear answers: a quick check that an engine works and is sensible, not a benchmark.

import type { DecisionEngine, DecisionRequest, DecisionResponse } from '../core';
import { tacitHome } from '../daemon/db';
import { chainText, chooseEngine, engineFor, MODELS_FILE, PRESETS } from '../daemon/engine';
import { loadKeys } from '../daemon/keys';

interface Sample {
  name: string;
  request: DecisionRequest;
  /** The right choice, or for yes/no batches whether each question is a yes. */
  expect: string | Record<string, boolean>;
}

const page = (title: string, url: string, kind = 'article') => ({ title, url, kind });
const choice = (intent: string, p: ReturnType<typeof page>, options: string[]): DecisionRequest => ({
  state: { user_intent: intent, evidence: [`searched “${intent}”`], page: p },
  questions: {
    next: {
      type: 'choice',
      instructions: 'Given what the user is trying to do, which of these is the next thing they want on this page?',
      criteria: { ...Object.fromEntries(options.map((o, i) => [`${i + 1}. ${o}`, null])), none: 'None of these; the user wants something else' },
    },
  },
});

const POSTS: [string, boolean][] = [
  ['We cut our agent’s token bill by 60% by retrieving only the sections the user actually had open.', true],
  ['Lakers win in overtime, LeBron with 40.', false],
  ['MCP servers are becoming the default way to hand an agent context from your own tools.', true],
  ['My sourdough finally rose properly after three attempts.', false],
  ['A long context window does not remove the need to choose what goes into the prompt.', true],
  ['The new phone colors leaked a week early.', false],
];

const SAMPLES: Sample[] = [
  {
    name: 'cancel a fetch',
    request: choice('how to cancel a fetch request in javascript', page('Using the Fetch API - Web APIs | MDN', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch'), [
      'Jump to: Making a request',
      'Jump to: Canceling a request',
      'Jump to: Uploading a file',
      'Open: Response.json()',
    ]),
    expect: '2. Jump to: Canceling a request',
  },
  {
    name: 'effect cleanup',
    request: choice('react useeffect cleanup function', page('Synchronizing with Effects – React', 'https://react.dev/learn/synchronizing-with-effects'), [
      'Jump to: How to write an Effect',
      'Jump to: You might not need an Effect',
      'Open: useMemo reference',
      'Jump to: Step 3: Add cleanup if needed',
    ]),
    expect: '4. Jump to: Step 3: Add cleanup if needed',
  },
  {
    name: 'sqlite docs',
    request: choice('bun sqlite full text search', page('oven-sh/bun: Incredibly fast JavaScript runtime', 'https://github.com/oven-sh/bun', 'repo'), [
      'Open: Issues',
      'Open: Releases',
      'Open: docs/api/sqlite.md',
      'Star this repository',
    ]),
    expect: '3. Open: docs/api/sqlite.md',
  },
  {
    name: 'nothing fits',
    request: choice('miso ramen recipe', page('Using the Fetch API - Web APIs | MDN', 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch'), [
      'Jump to: Making a request',
      'Jump to: Setting headers',
      'Open: Response',
    ]),
    expect: 'none',
  },
  {
    name: 'feed of six posts',
    request: {
      state: { user_intent: 'context engineering for ai agents', evidence: ['searched “context engineering”'], page: page('Home / X', 'https://x.com/home', 'feed') },
      questions: Object.fromEntries(
        POSTS.map(([text], i) => [`post_${i}`, { type: 'noul' as const, instructions: { question: 'Is this post about what the user is trying to do right now?', post: text } }]),
      ),
    },
    expect: Object.fromEntries(POSTS.map(([, yes], i) => [`post_${i}`, yes])),
  },
];

/** How many of a sample's answers are right, and what went wrong. */
function grade(s: Sample, res: DecisionResponse): { right: number; of: number; miss?: string } {
  if (typeof s.expect === 'string') {
    const a = res.answers.next;
    const ok = a?.type === 'choice' && a.choice === s.expect;
    return { right: ok ? 1 : 0, of: 1, ...(ok ? {} : { miss: `${s.name}: chose “${a?.type === 'choice' ? a.choice : '?'}”, not “${s.expect}”` }) };
  }
  const wrong = Object.entries(s.expect).filter(([k, yes]) => {
    const a = res.answers[k];
    return a?.type !== 'noul' || a.noul >= 0.5 !== yes;
  });
  return { right: Object.keys(s.expect).length - wrong.length, of: Object.keys(s.expect).length, ...(wrong.length ? { miss: `${s.name}: wrong about ${wrong.map(([k]) => k).join(', ')}` } : {}) };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

interface Score {
  right: number;
  of: number;
}

async function trial(label: string, engine: DecisionEngine): Promise<Score> {
  let right = 0;
  let of = 0;
  let cost = 0;
  const times: number[] = [];
  const notes: string[] = [];
  for (const s of SAMPLES) {
    const t0 = performance.now();
    try {
      const res = await engine.decide(s.request);
      times.push(performance.now() - t0);
      const g = grade(s, res);
      right += g.right;
      of += g.of;
      cost += res.usage?.cost ?? 0;
      if (g.miss) notes.push(g.miss);
      if (res.fallbackReason) notes.push(`${s.name}: answered by ${res.engine} (${res.fallbackReason})`);
      if (res.escalated) notes.push(`${s.name}: ${res.escalated.engine} settled ${res.escalated.questions.join(', ')}`);
    } catch (err) {
      of += typeof s.expect === 'string' ? 1 : Object.keys(s.expect).length;
      notes.push(`${s.name}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 240));
    }
  }
  const spent = cost ? ` · $${cost.toFixed(6)}` : '';
  console.log(`${label.padEnd(46)} ${right}/${of} right · ${times.length}/${SAMPLES.length} answered · ${Math.round(median(times))} ms median${spent}`);
  for (const n of notes) console.log(`    ${n}`);
  return { right, of };
}

/** A model that does worse than the code engine makes every decision worse: say so, rather than leave it to a table. */
function compare(scores: { label: string; score: Score }[], code: Score): void {
  for (const { label, score } of scores) {
    if (score.right < code.right) {
      console.log(`\nNote: ${label} got ${score.right}/${score.of}, below the code engine's ${code.right}/${code.of}. It would make decisions worse; try a larger model.`);
    }
  }
}

const home = tacitHome();
const chosen = chooseEngine(process.env, home);
const d = chosen.decisions;
const args = process.argv.slice(2);

console.log(`Who decides, from ${home}/${MODELS_FILE} and the keys:\n  ${chainText(d)}`);
if (d.problem) console.log(`  ${d.problem}. Until it is fixed, the code engine decides, on this machine.`);
for (const s of d.skipped) console.log(`  not asked: ${s.id} (${s.reason === 'no-key' ? 'no key yet: bun run keys set …' : 'decisions stay on this machine'})`);

if (args.includes('--try')) {
  console.log('');
  const slugs = args.filter((a) => a !== '--try');
  if (slugs.length) {
    const keys = loadKeys(home);
    if (!keys.openrouter) {
      console.error('Trying OpenRouter models needs an OpenRouter key: bun run keys set openrouter');
      process.exit(1);
    }
    for (const slug of slugs) {
      const systemone = slug.startsWith('systemone:');
      const model = systemone ? slug.slice('systemone:'.length) : slug;
      const preset = PRESETS[systemone ? 'openrouter' : 'openrouter-llm']!;
      await trial(slug, engineFor(systemone ? 'openrouter' : 'openrouter-llm', { ...preset, models: [model] }, keys));
    }
  } else {
    const scores: { label: string; score: Score }[] = [];
    let code: Score | undefined;
    for (const [i, engine] of chosen.parts.chain.entries()) {
      const info = d.chain[i]!;
      const label = `${info.label}${info.model ? ` ${info.model}` : ''}`;
      const score = await trial(`${i + 1}. ${label}`, engine);
      if (info.id === 'local') code = score;
      else scores.push({ label, score });
    }
    if (chosen.parts.escalate && d.escalate) await trial(`unsure → ${d.escalate.label} ${d.escalate.model ?? ''}`.trim(), chosen.parts.escalate);
    if (chosen.parts.chain.length > 1 || chosen.parts.escalate) await trial('the whole chain', chosen.engine);
    if (code) compare(scores, code);
  }
}
