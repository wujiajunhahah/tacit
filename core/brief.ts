// When an agent should hear about the user's screen. A note costs about 150 tokens, and one in every prompt is waste:
// the words of the request settle most cases for free, and a decision model gets one yes/no question for the rest.

import type { DecisionRequest } from './decision';
import { clip } from './text';

/**
 * Words that point at what the user has open: "this page", "what I'm reading", 这页, 刚才看的. Words that a coding
 * agent hears about its own work all day ("here", "above", "this file", "this doc") are left to the model.
 */
const POINTING = [
  /\b(this|that|the current|my current)\s+(web ?page|page|article|post|tweet|thread|tab|site|website|paper|video|blog|essay|story|listing|profile)\b/i,
  /\bwhat (i['’]?m|i am|i was) (reading|looking at|viewing|watching|browsing)\b/i,
  /\b(the page|the site|the tab) (i['’]?m|i am) on\b/i,
  /\bi (just|was just) (read|saw|looked at|opened)\b/i,
  /这(一)?(页|篇|个页面|个网页|个网站|个帖子|条推|个视频|篇文章)|当前(页面|网页)|我(正在|在)(看|读|浏览)的|正在看的|刚才(看|读|打开|查|搜)|刚刚(看|读|打开|查|搜)/,
];

export function refersToScreen(prompt: string): boolean {
  return POINTING.some((re) => re.test(prompt));
}

/** The one question a decision model gets: would this request be answered better knowing the user's screen? */
export function gateRequest(prompt: string, screen: { title: string; url: string; intent?: string }): DecisionRequest {
  return {
    state: { request: clip(prompt, 400), browser: { page: clip(screen.title, 120), url: screen.url, after: screen.intent ?? '' } },
    questions: {
      relevant: {
        type: 'noul',
        instructions: 'Would an assistant answer this request better if it knew what the user has open in their browser and what they were doing there?',
        criteria: { true: 'The request is about, or builds on, what they are reading or researching', false: 'The request stands on its own' },
      },
    },
  };
}
