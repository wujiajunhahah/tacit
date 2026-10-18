// Request validation, checked against core's types at compile time so the schemas cannot drift from the protocol.

import { z } from 'zod';
import type {
  Action,
  ActionKind,
  ActionState,
  Arrival,
  ArrivalKind,
  Block,
  BlockKind,
  Click,
  DecideRequest,
  IngestEvent,
  LedgerEntry,
  LedgerKind,
  Moment,
  OutlineEntry,
  PageKind,
  PageModel,
  Question,
  Region,
  Visit,
} from '../core';

export const MAX_EVENTS = 500;

/** An enum that must list every member of T, no more and no less. */
function oneOf<T extends string>(members: Record<T, true>) {
  return z.enum(Object.keys(members) as [T, ...T[]]);
}

/** An object schema that must name every key of T, optional ones too, so no field from core is silently stripped. */
function objectOf<T extends object>(shape: { [K in keyof Required<T>]: z.ZodType<T[K]> }): z.ZodType<T> {
  return z.object(shape as Record<string, z.ZodType>) as unknown as z.ZodType<T>;
}

const text = z.string();
const time = z.number();

const blockKind = oneOf<BlockKind>({ heading: true, para: true, item: true, code: true, quote: true });
const actionKind = oneOf<ActionKind>({ link: true, button: true, jump: true, copy: true });
const region = oneOf<Region>({ main: true, nav: true, header: true, footer: true, aside: true, unknown: true });
const pageKind = oneOf<PageKind>({ article: true, feed: true, repo: true, search: true, unknown: true });
const arrivalKind = oneOf<ArrivalKind>({
  search: true,
  link: true,
  typed: true,
  reload: true,
  back_forward: true,
  bookmark: true,
  new_tab: true,
  tacit: true,
  unknown: true,
});
const ledgerKind = oneOf<LedgerKind>({
  jump: true,
  navigate: true,
  copy: true,
  focus: true,
  fold: true,
  handoff: true,
  intent: true,
});
const actionState = oneOf<ActionState>({ suggested: true, confirmed: true, executed: true, undone: true, dismissed: true });

// Unknown kinds from a newer extension degrade to a neutral kind instead of losing the whole event.
const BlockSchema = objectOf<Block>({
  id: text,
  kind: blockKind.catch('para'),
  text,
  level: z.number().optional(),
  section: text,
});

const ActionSchema = objectOf<Action>({
  id: text,
  kind: actionKind.catch('link'),
  label: text,
  href: text.optional(),
  context: text,
  region: region.catch('unknown'),
  visited: z.boolean().optional(),
  targetBlockId: text.optional(),
  payload: text.optional(),
});

export const PageSchema = objectOf<PageModel>({
  url: text.min(1),
  title: text,
  domain: text,
  lang: text.optional(),
  description: text.optional(),
  kind: pageKind.catch('unknown'),
  blocks: z.array(BlockSchema),
  actions: z.array(ActionSchema),
  outline: z.array(objectOf<OutlineEntry>({ level: z.number(), text, blockId: text })),
  textLength: z.number(),
});

const MomentSchema = objectOf<Moment>({ text, at: time });

export const VisitSchema = objectOf<Visit>({
  id: text.min(1),
  url: text.min(1),
  title: text,
  domain: text,
  tabId: z.number().optional(),
  startedAt: time,
  endedAt: time.optional(),
  dwellMs: z.number(),
  maxScroll: z.number(),
  arrival: objectOf<Arrival>({
    kind: arrivalKind.catch('unknown'),
    fromUrl: text.optional(),
    fromTitle: text.optional(),
    viaLabel: text.optional(),
    searchQuery: text.optional(),
  }),
  searchQuery: text.optional(),
  selections: z.array(MomentSchema),
  copies: z.array(MomentSchema),
  clicks: z.array(objectOf<Click>({ label: text, href: text.optional(), at: time })),
  statedIntent: MomentSchema.optional(),
});

export const LedgerEntrySchema = objectOf<LedgerEntry>({
  id: text.min(1),
  at: time,
  kind: ledgerKind,
  label: text,
  state: actionState,
  url: text,
  reason: text,
  confidence: z.number().optional(),
  engine: text.optional(),
  undoable: z.boolean(),
});

export const IngestEventSchema: z.ZodType<IngestEvent> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page'), page: PageSchema, visit: VisitSchema }),
  z.object({ kind: z.literal('visit'), visit: VisitSchema }),
  z.object({ kind: z.literal('ledger'), entry: LedgerEntrySchema }),
]);

/** Events are checked one by one, so one bad event does not sink the batch. */
export const IngestEnvelopeSchema = z.object({ events: z.array(z.unknown()).max(MAX_EVENTS) });

// Decisions are relayed to an engine, so fields this daemon does not know about pass through untouched.
const instructions = z.union([text, z.record(z.string(), z.unknown()), z.array(z.unknown())]);

const QuestionSchema: z.ZodType<Question> = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('noul'),
    instructions,
    criteria: z.looseObject({ true: text.optional(), false: text.optional() }).optional(),
  }),
  z.looseObject({
    type: z.literal('choice'),
    instructions,
    criteria: z.record(z.string(), text.nullable()).refine((c) => Object.keys(c).length > 0, 'needs at least one option'),
  }),
  z.looseObject({ type: z.literal('score'), instructions, criteria: z.array(text).min(2).max(10) }),
]);

export const DecideSchema: z.ZodType<DecideRequest> = z.looseObject({
  state: z.unknown(),
  questions: z
    .record(z.string(), QuestionSchema)
    .refine((q) => Object.keys(q).length > 0, 'needs at least one question'),
});

/** The first validation problem as one readable line. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid request';
  return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}
