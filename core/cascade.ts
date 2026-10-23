// The reflex cascade. Models are asked in order: the next one starts when the one before fails, or when it has not
// answered within `hedgeMs`, and the first answer wins. The last engine is the floor, the code engine that answers at
// once: it is asked only when every model has failed or the budget is spent, so a slow network never holds the page.
// When the winning answer to a choice is unsure, a stronger model gets that question again within what is left of
// the budget, and its answer is kept only if it is surer. Yes/no batches never escalate: forty posts are a cost, not a
// doubt.

import { DecisionError, type ChoiceAnswer, type DecisionEngine, type DecisionRequest, type DecisionResponse } from './decision';

export interface CascadeOptions {
  /** Asked again about unsure choices; failures leave the first answer standing. */
  escalate?: DecisionEngine;
  /** A choice below this confidence (see choiceConfidence) is unsure. */
  unsureBelow?: number;
  /** How long a model may take before the next one starts alongside it. */
  hedgeMs?: number;
  /** For the whole decision, escalation included: the extension stops waiting at 4 s. */
  budgetMs?: number;
}

export const UNSURE_BELOW = 0.55;
/** Jev answers most questions in about 100 ms; a model still silent at this point is having a bad moment. */
export const HEDGE_MS = 800;
export const BUDGET_MS = 3200;
/** Too little left for a second model to be worth starting. */
const ESCALATE_MIN_MS = 250;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class CascadeEngine implements DecisionEngine {
  private readonly models: DecisionEngine[];
  private readonly floor: DecisionEngine;

  constructor(
    private readonly engines: DecisionEngine[],
    private readonly opts: CascadeOptions = {},
  ) {
    if (engines.length === 0) throw new DecisionError('a cascade needs at least one engine');
    this.models = engines.slice(0, -1);
    this.floor = engines[engines.length - 1]!;
  }

  get name(): string {
    return this.engines[0]!.name;
  }

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    const t0 = performance.now();
    const budget = this.opts.budgetMs ?? BUDGET_MS;
    const failures: string[] = [];
    let res = await this.race(req, budget, failures);
    const fromFloor = !res;
    if (!res) {
      try {
        res = await this.floor.decide(req);
      } catch (err) {
        failures.push(`${this.floor.name}: ${message(err)}`);
        throw new DecisionError(failures.join('; '));
      }
    }
    if (failures.length) res = { ...res, fallbackReason: failures.join('; ') };
    // Every model failed: the strong one most likely would too, and the page should not wait for it.
    if (!(fromFloor && this.models.length)) res = await this.escalate(req, res, budget - (performance.now() - t0));
    return { ...res, latencyMs: performance.now() - t0 };
  }

  /** The models, hedged: the first answer, or null once every model has failed or the budget is spent. */
  private race(req: DecisionRequest, budget: number, failures: string[]): Promise<DecisionResponse | null> {
    const models = this.models;
    if (models.length === 0) return Promise.resolve(null);
    const hedge = this.opts.hedgeMs ?? HEDGE_MS;
    return new Promise((resolve) => {
      /** Running models, by their place in the chain. */
      const running = new Map<string, number>();
      let next = 0;
      let done = false;
      let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
      // An answer passes over the models before it in the chain that are still running; those after it lost nothing.
      const finish = (res: DecisionResponse | null, why: string, place = models.length) => {
        if (done) return;
        done = true;
        clearTimeout(hedgeTimer);
        clearTimeout(budgetTimer);
        for (const [name, at] of running) if (at < place) failures.push(`${name}: ${why}`);
        resolve(res);
      };
      const budgetTimer = setTimeout(() => finish(null, `no answer within ${budget} ms`), budget);
      const start = () => {
        clearTimeout(hedgeTimer);
        if (done) return;
        if (next >= models.length) {
          if (running.size === 0) finish(null, '');
          return;
        }
        const place = next++;
        const engine = models[place]!;
        running.set(engine.name, place);
        engine.decide(req).then(
          (res) => {
            running.delete(engine.name);
            finish(res, `slower than ${engine.name}`, place);
          },
          (err) => {
            running.delete(engine.name);
            if (done) return;
            failures.push(`${engine.name}: ${message(err)}`);
            // Another model is still running: its hedge timer starts the next one if it is slow.
            if (running.size === 0) start();
          },
        );
        if (next < models.length) hedgeTimer = setTimeout(start, hedge);
      };
      start();
    });
  }

  private async escalate(req: DecisionRequest, res: DecisionResponse, leftMs: number): Promise<DecisionResponse> {
    const strong = this.opts.escalate;
    const below = this.opts.unsureBelow ?? UNSURE_BELOW;
    if (!strong || strong.name === res.engine || leftMs < ESCALATE_MIN_MS) return res;
    const unsure = Object.keys(res.answers).filter((k) => {
      const a = res.answers[k];
      return a?.type === 'choice' && a.confidence < below && req.questions[k]?.type === 'choice';
    });
    if (unsure.length === 0) return res;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const second = await Promise.race([
        strong.decide({ state: req.state, questions: Object.fromEntries(unsure.map((k) => [k, req.questions[k]!])) }),
        new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new DecisionError('out of time')), leftMs))),
      ]);
      const answers = { ...res.answers };
      const taken = unsure.filter((k) => {
        const a = second.answers[k];
        if (a?.type !== 'choice' || a.confidence <= (res.answers[k] as ChoiceAnswer).confidence) return false;
        answers[k] = a;
        return true;
      });
      if (taken.length === 0) return res;
      return { ...res, answers, escalated: { engine: second.engine, model: second.model, questions: taken } };
    } catch {
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
