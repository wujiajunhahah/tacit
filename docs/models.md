# Who decides

Tacit makes one kind of model call: a typed decision. On an article, *which of these is the next thing the user wants?* On a feed, *is this post about what they are after?* The answers come back as probabilities, the local view is already on screen, and the answer refines it. Your agent's own model does everything open-ended, through MCP. Tacit never calls a large model to write anything.

No model is needed. Without a key, Tacit decides in code, on this machine.

## The chain

The harness asks engines in order. The next one starts when the one before fails, or when it has not answered within 800 ms, and the first answer wins. The code engine ends every chain and answers at once, so a slow network never holds the page. A choice the first answer is unsure of goes to a chat model once more, within what is left of 3.2 s, and the surer answer stands.

| Keys you set | Asked in order | Unsure choices |
|---|---|---|
| none | the code engine | |
| OpenRouter | Jev 1.14 → Inception's mercury-decide → code | Gemini 3.1 Flash Lite |
| TypeSafe | Jev (`jev-latest`) → code | |
| both | Jev from TypeSafe → Jev through OpenRouter → mercury-decide → code | Gemini 3.1 Flash Lite |
| DeepSeek | DeepSeek's `deepseek-flash` (chat) → code | |
| OpenRouter and DeepSeek | Jev 1.14 → mercury-decide → `deepseek-flash` → code | Gemini 3.1 Flash Lite |
| `TACIT_PRIVACY=local` | a decision model in Ollama (`tev1`) → code | |

Jev leads because it is built for exactly this: typed questions in, calibrated probabilities out, in about half a second. The second decision model is from another company, so an outage at one does not stop the loop. Through OpenRouter every request asks for endpoints that keep nothing (zero data retention) and do not train on what they see.

## Set a key

```bash
bun run keys set openrouter      # asks for the key without showing it
bun run keys set typesafe
bun run keys list                # which keys, from where, never the key itself
bun run keys remove openrouter
```

Keys live in `~/.tacit/keys.json`, readable by your account only. `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY` and `DEEPSEEK_API_KEY` in the harness's environment win over the file.

**DeepSeek** (`bun run keys set deepseek`) answers where OpenRouter needs a proxy, mainland China among them. It is a chat model, not a decision model, so it comes after any decision model you have a key for; Tacit turns its thinking off, and, since DeepSeek's API takes JSON mode but no JSON schema, sends the schema with each request. DeepSeek offers no routing that keeps nothing: requests are kept under its own terms. Not measured here yet: `bun run models --try` says how it does on your machine. A running harness picks up a new key, or a changed `models.json`, by itself.

## Check it

```bash
bun run models          # who decides, and what is not asked and why
bun run models --try    # each engine on five questions with clear answers: right, latency, cost
```

`--try` also takes OpenRouter models, to compare before you pick one: a slug is a chat model, `systemone:` a decision model.

```bash
bun run models --try google/gemini-3.1-flash-lite systemone:inception/mercury-decide
```

What it said on 21 October 2026, on one machine, through a proxy. Five questions are a check that an engine works and is sensible, not a benchmark:

| Model | Right | Median | 5 questions |
|---|---|---|---|
| Jev 1.14 (decision) | 10/10 | 488 ms | $0.0001 |
| Inception mercury-decide (decision) | 10/10 | 608 ms | $0.00003 |
| Perplexity pplx-decider-flash (decision) | 9/10 | 1103 ms | $0.00002 |
| Gemini 3.1 Flash Lite (chat) | 10/10 | 1187 ms | $0.0017 |
| GPT-4.1 nano (chat) | 10/10 once, then every request past 2.5 s | 1530 ms | $0.0004 |
| Together's tev1 0.8B, in Ollama on this machine (decision) | 5/10 | 166 ms | free |
| the code engine | 6/10 | 0 ms | free |

GPT-6 Luna and Claude Haiku 5.5 had no endpoint that both keeps nothing and honors a JSON schema, so OpenRouter refused them; Mercury 2.5 and Mistral Small 3.2 mostly gave no usable answer in time. Decision models answered as well as chat models, in half the time, for a tenth of the price. The 0.8B local model did worse than code: it answers "none" and "no" too readily (0.78 on "none" where the docs page was the answer), so `--try` says so when a model scores below the code engine.

## Keep it on this machine

```bash
ollama pull tev1                       # the 4B, 4.6 GB
TACIT_PRIVACY=local bun run harness
bun run models --try                   # does it beat the code engine on your machine?
```

Or put `"privacy": "local"` in `~/.tacit/models.json`. Kept local, only engines whose address is this machine (`127.0.0.1`, `localhost`, `::1`) are asked; anything else is skipped, and the dashboard's Connect page says so. The environment can keep decisions local; it can never send them out when the file says local.

`tev1:0.8b` is smaller (0.8 GB, or 1.5 GB on Apple silicon, where Ollama fetches it in BF16) and answers in under 0.2 s, but on Tacit's samples it did worse than the code engine, so it is not the default. Larger decision models in Ollama: `nimble` and `clef-flash` (9B), `clef` (27B). To use another, name it: `{ "providers": { "ollama": { "models": ["nimble"] } } }`.

How "nothing leaves" was checked, on 21 October 2026: the harness ran with an OpenRouter key set and every outbound request sent through a proxy that writes down each attempt and refuses it. Kept local, five questions and five real sites made no attempt at all; the same questions with decisions not kept local made 25, all to `openrouter.ai`.

## models.json

`~/.tacit/models.json` (or `$TACIT_HOME/models.json`) changes the chain. Every field is optional.

```json
{
  "privacy": "cloud",
  "reflex": ["openrouter", "openrouter-decide"],
  "escalate": "openrouter-llm",
  "unsureBelow": 0.55,
  "providers": {
    "openrouter-llm": { "models": ["google/gemini-3.1-flash-lite"] }
  }
}
```

| Field | Means |
|---|---|
| `privacy` | `"local"` asks only engines on this machine. |
| `reflex` | Provider ids, in order. The code engine always ends the chain. `[]` leaves only the code engine. |
| `escalate` | The provider asked again about unsure choices; `null` for never. |
| `unsureBelow` | A choice below this confidence is unsure. Confidence is TypeSafe's: how far the top option stands above an even guess, 0 to 1. |
| `providers` | Changes to the built-ins, or new ones, by id. |

A provider:

| Field | Means |
|---|---|
| `api` | `"systemone"`: TypeSafe's decision API, `POST {baseUrl}/v1/systemone`. `"chat"`: an OpenAI-compatible chat API, `POST {baseUrl}/chat/completions`, answering through a strict JSON schema. |
| `json` | For `chat`: `"object"` for an API with JSON mode but no JSON schema, such as DeepSeek's; the schema then goes in the request. |
| `label` | What the dashboard calls it. |
| `baseUrl` | For `systemone`, the part before `/v1/systemone`; for `chat`, up to and including `/v1`. |
| `models` | The first is asked. Through OpenRouter's chat API, the rest are its fallbacks. |
| `key` | The key's name in `keys.json`. None for a server without auth. |
| `timeoutMs` | Per request, 100 to 30,000. Default 2,500. |
| `headers`, `body` | Sent with every request, e.g. OpenRouter's `provider` routing. |

Built in: `jev` (TypeSafe), `openrouter` (Jev through OpenRouter), `openrouter-decide` (mercury-decide), `openrouter-llm` (Gemini 3.1 Flash Lite), `deepseek` (`deepseek-flash`), `ollama` (tev1).

A `models.json` that cannot be used (bad JSON, an unknown provider, a bad address) leaves only the code engine, on this machine, until it is fixed: a typo must never send decisions somewhere you said they should not go. The harness log and the Connect page say what is wrong.

### Examples

A local server first, the cloud only for doubts:

```json
{
  "reflex": ["ollama"],
  "escalate": "openrouter-llm"
}
```

LM Studio, llama.cpp or vLLM with a decision model, through the same System One API:

```json
{
  "privacy": "local",
  "reflex": ["studio"],
  "providers": {
    "studio": { "api": "systemone", "label": "LM Studio", "baseUrl": "http://127.0.0.1:1234", "models": ["your-loaded-decision-model"] }
  }
}
```

Any OpenAI-compatible chat server (vLLM, llama.cpp, LiteLLM, OpenAI itself), answering through a JSON schema:

```json
{
  "reflex": ["vllm"],
  "providers": {
    "vllm": { "api": "chat", "label": "vLLM", "baseUrl": "http://127.0.0.1:8000/v1", "models": ["Qwen/Qwen3-8B"] }
  }
}
```

The newest Jev instead of the pinned one, and no second opinion:

```json
{
  "escalate": null,
  "providers": { "openrouter": { "models": ["~typesafe/jev-latest"] } }
}
```

## The details

- **Confidence is one scale.** Every engine reports a choice's confidence as `(p_max - 1/n) / (1 - 1/n)`, as TypeSafe defines it, so 0.6 means the same with three options or twelve.
- **A chat model counts for a little less.** Its probabilities are its own say-so, often overconfident, so 15% of them is spread evenly before the policy weighs them.
- **The policy decides, not the model.** An answer only moves probabilities; whether the line acts, suggests or asks is the gate's call, against thresholds your undos calibrate.
- **"None of these" means no step.** When the engine says nothing on the page fits, the line says what you are after and offers nothing.
- **When every model fails,** the code engine in the harness answers, and the extension keeps the view it already showed, which knows the page better.
- **The connection stays warm.** A new TLS connection through a proxy took from 0.1 s to 6 s, Jev itself under half a second. While you browse, the harness keeps a connection open to each model host with a bare `HEAD` at most once a minute, carrying nothing about you.
- **Behind a proxy,** `bun run service install` carries the shell's `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` into the background service, leaving out any with a password in it.

What each request contains, and where it goes: [PRIVACY.md](../PRIVACY.md#models-you-choose).
