import { describe, expect, test } from 'bun:test';
import { forgetKey } from '../../core';
import { forgetKeySync } from '../../daemon/db';
import { forgottenTest } from '../../extension/src/background';

const article = 'https://example.com/context';
const other = 'https://news.example/item';

describe('forgetting in the extension', () => {
  test('the extension and the harness hash a page the same way', async () => {
    expect(await forgetKey(article)).toBe(forgetKeySync(article));
  });

  test('a page deleted in the harness takes its history with it, and nothing else', async () => {
    const gone = await forgottenTest({ at: 2000, pages: [{ key: forgetKeySync(article), at: 2000 }] }, [article, other]);
    expect(gone(article, 1500)).toBe(true);
    expect(gone(article, 2500)).toBe(false);
    expect(gone(other, 1500)).toBe(false);
  });

  test('deleting everything forgets everything from before it', async () => {
    const gone = await forgottenTest({ at: 3000, all: 3000, pages: [] }, [article]);
    expect(gone(article, 2999)).toBe(true);
    expect(gone('https://never.seen/', 10)).toBe(true);
    expect(gone(article, 3001)).toBe(false);
  });
});
