// Prompt hooks: an agent runs `tacit hook <agent>` before each prompt, hands it the prompt as JSON on stdin, and adds
// what comes back to the model's context. Each agent has its own shape for both; this is the only place that knows them.
//
// - claude: Claude Code's UserPromptSubmit. DeepSeek Harness runs the same hooks through its Claude Code bridge.
// - codex: Codex's UserPromptSubmit, the same shape as Claude Code's.
// - gemini: Gemini CLI's BeforeAgent. Its stdout must be JSON, even with nothing to add.
// - cline: Cline's UserPromptSubmit script. It must always say whether to go on.

export const HOOK_AGENTS = ['claude', 'codex', 'gemini', 'cline'] as const;
export type HookAgent = (typeof HOOK_AGENTS)[number];

/** The prompt, out of what the agent's hook receives. Plain text counts as the prompt itself. */
export function hookInput(agent: HookAgent, stdin: string): string {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return stdin;
  }
  const at = (raw ?? {}) as { prompt?: unknown; userPromptSubmit?: { prompt?: unknown } };
  const prompt = agent === 'cline' ? at.userPromptSubmit?.prompt : at.prompt;
  return typeof prompt === 'string' ? prompt : '';
}

/** What to print so the agent adds the note to its context; for most agents, nothing when there is no note. */
export function hookOutput(agent: HookAgent, note: string | undefined): string | undefined {
  switch (agent) {
    case 'claude':
    case 'codex':
      return note ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: note } }) : undefined;
    case 'gemini':
      return JSON.stringify(note ? { hookSpecificOutput: { hookEventName: 'BeforeAgent', additionalContext: note } } : {});
    case 'cline':
      return JSON.stringify(note ? { cancel: false, contextModification: note } : { cancel: false });
  }
}
