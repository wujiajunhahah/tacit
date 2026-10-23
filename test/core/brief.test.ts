import { describe, expect, test } from 'bun:test';
import { gateRequest, refersToScreen } from '../../core';

describe('when a request points at the screen', () => {
  test('words that point at what the user has open, in English and Chinese', () => {
    for (const p of [
      "What's the main argument of this page?",
      'summarize this article for me',
      "explain what I'm reading",
      'Is the claim on the page I’m on right?',
      'I just read something about rate limits',
      '我正在看的这页讲了什么？',
      '帮我总结一下这篇文章',
      '刚才查的那个人是谁',
      '这个网页的作者是谁',
    ]) {
      expect(refersToScreen(p), p).toBe(true);
    }
  });

  test('not the words a coding agent hears about its own work all day', () => {
    for (const p of ['fix the error above', 'here is my stack trace', 'refactor this file', 'update this doc string', 'write a regex for emails', '帮我修一下这个函数']) {
      expect(refersToScreen(p), p).toBe(false);
    }
  });

  test('the model gets one yes/no question, with the request clipped and the page named', () => {
    const req = gateRequest('x'.repeat(1000), { title: 'Erwin Huang | HKUST CEI', url: 'https://cei.hkust.edu.hk/erwin', intent: 'erwin hkust' });
    expect(Object.values(req.questions).map((q) => q.type)).toEqual(['noul']);
    const state = req.state as { request: string; browser: { page: string; url: string; after: string } };
    expect(state.request.length).toBeLessThanOrEqual(401);
    expect(state.browser).toEqual({ page: 'Erwin Huang | HKUST CEI', url: 'https://cei.hkust.edu.hk/erwin', after: 'erwin hkust' });
  });
});
