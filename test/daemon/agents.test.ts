import { describe, expect, test } from 'bun:test';
import { estimateTokens } from '../../core';
import { agentLine, withHook } from '../../daemon/agents';
import { hookInput, hookOutput } from '../../daemon/hooks';

describe('agent hooks', () => {
  test('a hook Tacit wrote before is replaced, wherever it was; every other hook stays', () => {
    const settings = {
      model: 'x',
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: '/old/bun /old/tacit/daemon/cli.ts hook claude' }, { type: 'command', command: 'echo hi' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
      },
    };
    const next = withHook(settings, 'UserPromptSubmit', '/bun /tacit/daemon/cli.ts hook claude', 10)!;
    expect(next.model).toBe('x');
    expect(next.hooks).toEqual({
      UserPromptSubmit: [
        { matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] },
        { hooks: [{ type: 'command', command: '/bun /tacit/daemon/cli.ts hook claude', timeout: 10 }] },
      ],
      Stop: settings.hooks.Stop,
    });
    expect(withHook([], 'UserPromptSubmit', 'x', 10)).toBeNull();
    expect(withHook({ hooks: { UserPromptSubmit: 'no' } }, 'UserPromptSubmit', 'x', 10)).toBeNull();
  });

  test('each agent hears the prompt and gets the note in its own shape', () => {
    expect(hookInput('claude', JSON.stringify({ prompt: 'what is this page about?' }))).toBe('what is this page about?');
    expect(hookInput('cline', JSON.stringify({ hookName: 'UserPromptSubmit', userPromptSubmit: { prompt: 'this page?' } }))).toBe('this page?');
    expect(hookInput('codex', 'null')).toBe('');
    expect(hookInput('gemini', 'plain words')).toBe('plain words');
    expect(JSON.parse(hookOutput('codex', 'note')!)).toEqual({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'note' } });
    expect(JSON.parse(hookOutput('gemini', 'note')!)).toEqual({ hookSpecificOutput: { hookEventName: 'BeforeAgent', additionalContext: 'note' } });
    expect(JSON.parse(hookOutput('cline', 'note')!)).toEqual({ cancel: false, contextModification: 'note' });
    // Nothing to add: some agents want silence, others an answer all the same.
    expect(hookOutput('claude', undefined)).toBeUndefined();
    expect(hookOutput('gemini', undefined)).toBe('{}');
    expect(hookOutput('cline', undefined)).toBe('{"cancel":false}');
  });

  test('the line in an agent instructions costs little on every request', () => {
    expect(estimateTokens(agentLine('tacit'))).toBeLessThan(50);
  });
});
