// Picks the decision engine: Jev when a TypeSafe key is configured, local reflexes otherwise.

import { FallbackEngine, JEV_DEFAULT_MODEL, JevEngine, LocalEngine, type DecisionEngine } from '../core';
import type { Env } from './db';

export interface EngineChoice {
  engine: DecisionEngine;
  name: 'jev' | 'local';
  model?: string;
}

export function chooseEngine(env: Env): EngineChoice {
  const apiKey = env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return { engine: new LocalEngine(), name: 'local' };
  const model = env.TYPESAFE_MODEL || JEV_DEFAULT_MODEL;
  const jev = new JevEngine({ apiKey, model, baseUrl: env.TYPESAFE_BASE_URL || undefined });
  return { engine: new FallbackEngine(jev, new LocalEngine()), name: 'jev', model };
}
