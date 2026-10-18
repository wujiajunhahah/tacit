import type { Action, Block, PageModel, Visit } from '../../core';

export const NOW = 1_800_000_000_000;
export const MIN = 60_000;

let seq = 0;

export function visit(partial: Partial<Visit> & { url: string }): Visit {
  return {
    id: `v${++seq}`,
    title: '',
    domain: new URL(partial.url).hostname,
    startedAt: NOW - MIN,
    dwellMs: 0,
    maxScroll: 0,
    arrival: { kind: 'unknown' },
    selections: [],
    copies: [],
    clicks: [],
    ...partial,
  };
}

const SECTIONS: [string, string[]][] = [
  [
    'Why interfaces got old',
    [
      'Every interface we use was designed for one kind of user: a person with a keyboard and a mouse. Buttons are for clicking, text is for reading, menus are for hunting.',
      'Agents now sit in front of the same screens, yet they see nothing unless we paste it to them. The interface ignores the smartest reader in the room.',
    ],
  ],
  [
    'System One decisions',
    [
      'A System One model does not write. It chooses. Given a state and a few typed options it returns a probability for each, which is exactly the shape of a click.',
      'Choosing the next link, folding a post, ranking a passage: these are multiple-choice questions, and they are the bulk of what an interface decides.',
    ],
  ],
  [
    'Latency: why 400 ms matters',
    [
      'Below roughly 400 milliseconds people stop waiting and start thinking with a system. That threshold is why decision latency matters more than raw accuracy for interfaces.',
      'A reflex that answers in 300 milliseconds can sit inside every click. A model that answers in four seconds has to live in a chat box beside the work.',
    ],
  ],
  [
    'The context ledger',
    [
      'Why you opened a page, how you got there and where you lingered are all context. Kept together they form a ledger that any agent can read without asking you again.',
    ],
  ],
  [
    'A brief history of the mouse',
    [
      'The mouse was demonstrated in 1968 and reached homes with the Macintosh in 1984. Its design has changed less than almost any other part of the computer.',
      'Trackpads, styluses and touchscreens all borrowed the same idea of pointing at a thing before acting on it.',
    ],
  ],
];

export function articlePage(): PageModel {
  const blocks: Block[] = [];
  const outline: PageModel['outline'] = [];
  let id = 0;
  blocks.push({ id: `b${id++}`, kind: 'heading', level: 1, text: 'Context is the new interface', section: '' });
  outline.push({ level: 1, text: 'Context is the new interface', blockId: 'b0' });
  for (const [heading, paras] of SECTIONS) {
    const hid = `b${id++}`;
    blocks.push({ id: hid, kind: 'heading', level: 2, text: heading, section: heading });
    outline.push({ level: 2, text: heading, blockId: hid });
    for (const p of paras) blocks.push({ id: `b${id++}`, kind: 'para', text: p, section: heading });
  }
  const actions: Action[] = [
    { id: 'a1', kind: 'link', label: 'Home', href: 'https://example.com/', context: '', region: 'nav' },
    { id: 'a2', kind: 'link', label: 'Sign in', href: 'https://example.com/login', context: '', region: 'header' },
    {
      id: 'a3',
      kind: 'link',
      label: 'Measuring decision latency in production',
      href: 'https://example.com/latency',
      context: 'Further reading on latency budgets for interfaces',
      region: 'main',
    },
    { id: 'a4', kind: 'link', label: 'The Mother of All Demos', href: 'https://example.com/1968', context: 'History of the mouse', region: 'main' },
    { id: 'a5', kind: 'link', label: 'Privacy', href: 'https://example.com/privacy', context: '', region: 'footer' },
  ];
  const textLength = blocks.reduce((n, b) => n + b.text.length, 0);
  return {
    url: 'https://example.com/context',
    title: 'Context is the new interface',
    domain: 'example.com',
    kind: 'article',
    blocks,
    actions,
    outline,
    textLength,
  };
}
