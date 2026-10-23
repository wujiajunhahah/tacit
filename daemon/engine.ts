// Who decides: model providers, the order they are asked in, and whether a decision may leave this machine.
//
// Built in, by id:
// - jev: TypeSafe's Jev, with a TypeSafe key.
// - openrouter: the same Jev through OpenRouter, with an OpenRouter key.
// - openrouter-decide: Inception's decision model through OpenRouter, for when Jev fails or is slow.
// - openrouter-llm: a fast general model through OpenRouter, asked again about choices the first answer is unsure of.
// - deepseek: DeepSeek's fast chat model, with a DeepSeek key: reachable where OpenRouter is not without a proxy.
// - ollama: a decision model on this machine (tev1), through the same System One API.
// With no models.json, every built-in with a key is asked, Jev first; kept local (TACIT_PRIVACY=local or "privacy":
// "local"), only Ollama is. The code engine always ends the chain.
// <home>/models.json can reorder them, change their models, keep decisions on this machine, or add any server that
// speaks System One or OpenAI's chat API. Keys stay in keys.json or the environment (daemon/keys.ts), never here.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  CascadeEngine,
  ChatEngine,
  JEV_DEFAULT_BASE_URL,
  JEV_DEFAULT_MODEL,
  LocalEngine,
  SystemOneEngine,
  type DecisionEngine,
  type DecisionsInfo,
  type EngineInfo,
} from '../core';
import type { Env } from './db';
import { loadKeys, type Keys } from './keys';

export const MODELS_FILE = 'models.json';

const ATTRIBUTION = { 'HTTP-Referer': 'https://github.com/wujiajunhahah/tacit', 'X-OpenRouter-Title': 'Tacit' };

const Provider = z.strictObject({
  /** "systemone": TypeSafe's typed-decision API; "chat": an OpenAI-compatible chat API, answering through a JSON schema. */
  api: z.enum(['systemone', 'chat']),
  label: z.string().min(1).max(40),
  baseUrl: z.url({ protocol: /^https?$/ }),
  /** The first is asked; through OpenRouter's chat API the rest are its fallbacks. */
  models: z.array(z.string().min(1).max(200)).min(1).max(8),
  /** The key's name in keys.json, or its environment variable; none for a server without auth. */
  key: z.string().min(1).max(40).optional(),
  timeoutMs: z.number().int().min(100).max(30_000).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  /** Extra request fields, e.g. OpenRouter's provider routing. */
  body: z.record(z.string(), z.unknown()).optional(),
  /** For "chat": "object" where the API has JSON mode but no JSON schema (DeepSeek); the schema then goes in the request. */
  json: z.enum(['schema', 'object']).optional(),
});

export type ProviderSpec = z.infer<typeof Provider>;

const Config = z.strictObject({
  /** "local": only engines on this machine are asked. */
  privacy: z.enum(['cloud', 'local']).optional(),
  /** Asked in this order; the code engine always ends the chain. */
  reflex: z.array(z.string()).max(6).optional(),
  /** Asked again about unsure choices; null for never. */
  escalate: z.string().nullable().optional(),
  unsureBelow: z.number().min(0).max(1).optional(),
  /** Changes to the built-ins, or new providers. */
  providers: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), Provider.partial()).optional(),
});

export type ModelsConfig = z.infer<typeof Config>;

// Through OpenRouter, only endpoints that keep nothing (zero data retention) and do not train on what they see.
const PRIVATE = { zdr: true, data_collection: 'deny' };

// Measured with `bun run models --try` (October 2026): decision models answered Tacit's samples as well as chat models,
// in half the time, for a tenth of the price; a chat model is kept for the choices they are unsure of.
export const PRESETS: Record<string, ProviderSpec> = {
  jev: { api: 'systemone', label: 'TypeSafe', baseUrl: JEV_DEFAULT_BASE_URL, models: [JEV_DEFAULT_MODEL], key: 'typesafe' },
  openrouter: {
    api: 'systemone',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    // Pinned, as TypeSafe advises once thresholds are tuned: an alias can move under them.
    models: ['typesafe/jev-1.14'],
    key: 'openrouter',
    headers: ATTRIBUTION,
    body: { provider: PRIVATE },
  },
  // Another company's decision model, so an outage at one does not stop the loop.
  'openrouter-decide': {
    api: 'systemone',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    models: ['inception/mercury-decide'],
    key: 'openrouter',
    headers: ATTRIBUTION,
    body: { provider: PRIVATE },
  },
  'openrouter-llm': {
    api: 'chat',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['google/gemini-3.1-flash-lite'],
    key: 'openrouter',
    headers: ATTRIBUTION,
    // The fastest endpoint that also honors the JSON schema.
    body: { provider: { ...PRIVATE, require_parameters: true, sort: 'latency' } },
  },
  // A chat model, with thinking off: it is slower than a decision model, so it comes after them. Its API has JSON mode
  // and no JSON schema. DeepSeek offers no zero-retention routing; PRIVACY.md says so.
  deepseek: { api: 'chat', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', models: ['deepseek-flash'], key: 'deepseek', json: 'object', body: { thinking: { type: 'disabled' } } },
  ollama: { api: 'systemone', label: 'Ollama', baseUrl: 'http://127.0.0.1:11434', models: ['tev1'], timeoutMs: 3000 },
};

/** The default chain, for whichever keys are set. */
const DEFAULT_REFLEX = ['jev', 'openrouter', 'openrouter-decide', 'deepseek'];
const DEFAULT_ESCALATE = 'openrouter-llm';

export interface EngineChoice {
  engine: DecisionEngine;
  /** The chain's engines one by one, and the one that settles unsure choices: for `bun run models --try`. */
  parts: { chain: DecisionEngine[]; escalate?: DecisionEngine };
  /** Origins off this machine that decisions go to, to keep a connection open to. */
  remote: string[];
  /** The first engine asked, e.g. "jev", or "local" when only the code engine decides. */
  name: string;
  model?: string;
  decisions: DecisionsInfo;
}

const LOCAL_INFO: EngineInfo = { id: 'local', label: 'local', here: true };

const WARM_EVERY_MS = 60_000;

/**
 * Keeps a connection open to each host decisions go to, while the user browses. Through a proxy a new TLS handshake
 * took anywhere from 0.1 to 6 s, and Jev itself under half a second. A HEAD carries nothing about the user.
 */
export function warmer(fetchImpl: typeof fetch = fetch): (origins: string[]) => void {
  const last = new Map<string, number>();
  return (origins) => {
    const now = Date.now();
    for (const origin of origins) {
      if (now - (last.get(origin) ?? 0) < WARM_EVERY_MS) continue;
      last.set(origin, now);
      void fetchImpl(origin, { method: 'HEAD', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
    }
  };
}

/** Whether requests to this URL stay on this machine. */
export function isHere(baseUrl: string): boolean {
  const host = new URL(baseUrl).hostname;
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host.endsWith('.localhost');
}

/** "OpenRouter typesafe/jev-1.14 → local · unsure → OpenRouter google/gemini-3.1-flash-lite", for logs and the CLI. */
export function chainText(d: DecisionsInfo): string {
  const name = (e: EngineInfo) => (e.model ? `${e.label} ${e.model}` : e.label);
  return [d.chain.map(name).join(' → '), d.escalate ? `unsure → ${name(d.escalate)}` : '', d.privacy === 'local' ? 'kept on this machine' : '']
    .filter(Boolean)
    .join(' · ');
}

/** Only the code engine, and why. */
function localOnly(problem: string): EngineChoice {
  const engine = new LocalEngine();
  return { engine, parts: { chain: [engine] }, remote: [], name: 'local', decisions: { privacy: 'local', chain: [LOCAL_INFO], skipped: [], problem } };
}

function issueOf(error: z.ZodError, at: string): string {
  const issue = error.issues[0];
  return `${[at, ...(issue?.path ?? [])].join('.')}: ${issue?.message ?? 'invalid'}`;
}

function readConfig(home: string): ModelsConfig | { problem: string } {
  const path = join(home, MODELS_FILE);
  if (!existsSync(path)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { problem: `${MODELS_FILE} is not JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const parsed = Config.safeParse(raw);
  return parsed.success ? parsed.data : { problem: issueOf(parsed.error, MODELS_FILE) };
}

export function engineFor(id: string, p: ProviderSpec, keys: Keys, fetchImpl?: typeof fetch): DecisionEngine {
  const apiKey = p.key ? keys[p.key] : undefined;
  if (p.api === 'systemone') {
    return new SystemOneEngine({ name: id, apiKey, model: p.models[0], baseUrl: p.baseUrl, timeoutMs: p.timeoutMs, headers: p.headers, body: p.body, fetch: fetchImpl });
  }
  // OpenRouter falls back through a model list itself, billed for the one that answered.
  const fallbacks = new URL(p.baseUrl).hostname === 'openrouter.ai' && p.models.length > 1 ? { models: p.models } : {};
  return new ChatEngine({ name: id, apiKey, baseUrl: p.baseUrl, models: p.models, timeoutMs: p.timeoutMs, headers: p.headers, body: { ...fallbacks, ...p.body }, json: p.json, fetch: fetchImpl });
}

/**
 * The cascade this harness runs, from `<home>/models.json`, the keys, and TACIT_PRIVACY. A models.json that cannot
 * be used leaves only the code engine: a typo must not send decisions somewhere the user said they should not go.
 */
export function chooseEngine(env: Env, home: string, fetchImpl?: typeof fetch): EngineChoice {
  const config = readConfig(home);
  if ('problem' in config) return localOnly(config.problem);
  const keys = loadKeys(home, env);
  const providers: Record<string, ProviderSpec> = { ...PRESETS };
  if (env.TYPESAFE_MODEL || env.TYPESAFE_BASE_URL) {
    providers.jev = { ...PRESETS.jev!, models: [env.TYPESAFE_MODEL || JEV_DEFAULT_MODEL], baseUrl: env.TYPESAFE_BASE_URL || JEV_DEFAULT_BASE_URL };
  }
  for (const [id, patch] of Object.entries(config.providers ?? {})) {
    const merged = Provider.safeParse({ ...providers[id], ...patch });
    if (!merged.success) return localOnly(issueOf(merged.error, `${MODELS_FILE}: providers.${id}`));
    providers[id] = merged.data;
  }
  const privacy = env.TACIT_PRIVACY === 'local' ? 'local' : (config.privacy ?? 'cloud');
  const named = config.reflex?.filter((id) => id !== 'local');
  // Kept on this machine, the natural engine is a decision model on it; the code engine answers if there is none.
  const reflexIds = named ?? (privacy === 'local' ? ['ollama'] : DEFAULT_REFLEX);
  const escalateId = config.escalate === null ? undefined : (config.escalate ?? (privacy === 'local' ? undefined : DEFAULT_ESCALATE));
  const unknown = [...reflexIds, ...(escalateId ? [escalateId] : [])].find((id) => !providers[id]);
  if (unknown) return localOnly(`${MODELS_FILE}: no provider "${unknown}"`);

  const blocked = (id: string): 'privacy' | 'no-key' | null => {
    const p = providers[id]!;
    if (privacy === 'local' && !isHere(p.baseUrl)) return 'privacy';
    return p.key && !keys[p.key] ? 'no-key' : null;
  };
  // Worth a note: what models.json names and cannot be asked, and, kept local, the built-ins a key is set for.
  const keyed = (id: string) => !providers[id]!.key || !!keys[providers[id]!.key!];
  const expected = new Set([...(named ?? []), ...(config.escalate ? [config.escalate] : []), ...(privacy === 'local' ? DEFAULT_REFLEX.filter(keyed) : [])]);
  const skipped = [...expected].flatMap((id) => {
    const reason = blocked(id);
    return reason ? [{ id, reason }] : [];
  });
  const info = (id: string): EngineInfo => {
    const p = providers[id]!;
    const here = isHere(p.baseUrl);
    return { id, label: p.label, model: p.models[0], here, ...(here ? {} : { host: new URL(p.baseUrl).hostname }) };
  };
  const reflex = reflexIds.filter((id) => !blocked(id));
  const escalate = escalateId && !blocked(escalateId) ? escalateId : undefined;
  const engines = [...reflex.map((id) => engineFor(id, providers[id]!, keys, fetchImpl)), new LocalEngine()];
  const strong = escalate ? engineFor(escalate, providers[escalate]!, keys, fetchImpl) : undefined;
  const engine = engines.length === 1 && !strong ? engines[0]! : new CascadeEngine(engines, { escalate: strong, unsureBelow: config.unsureBelow });
  const chain = [...reflex.map(info), LOCAL_INFO];
  const decisions: DecisionsInfo = { privacy, chain, ...(escalate ? { escalate: info(escalate) } : {}), skipped };
  const remote = [...new Set([...reflex, ...(escalate ? [escalate] : [])].map((id) => providers[id]!.baseUrl).filter((u) => !isHere(u)).map((u) => new URL(u).origin))];
  return { engine, parts: { chain: engines, escalate: strong }, remote, name: chain[0]!.id, model: chain[0]!.model, decisions };
}
