// Reading intent signals out of URLs.

const QUERY_KEYS = ['q', 'query', 'search_query', 'wd', 'word', 'text', 'keyword', 'keywords', 'search', 'p', 's', 'k'];
const AMBIGUOUS = new Set(['p', 's', 'k']);
const SEARCH_PATH = /\/(search|results|s)(\/|$|\?)/i;
const KNOWN_ENGINES =
  /(^|\.)(google|bing|duckduckgo|baidu|yahoo|yandex|sogou|perplexity|kagi|brave|ecosia|startpage|amazon|youtube|github|x|twitter|reddit)\./i;

/** The search query a URL carries, if it looks like a search. */
export function searchQueryOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  for (const key of QUERY_KEYS) {
    const value = u.searchParams.get(key)?.trim();
    if (!value || value.length < 2) continue;
    if (AMBIGUOUS.has(key) && !SEARCH_PATH.test(u.pathname) && !KNOWN_ENGINES.test(u.hostname)) continue;
    return value.slice(0, 200);
  }
  return undefined;
}

/** Same page, ignoring hash and trailing slash. */
export function sameDocument(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    const path = (p: string) => p.replace(/\/+$/, '') || '/';
    return x.origin === y.origin && path(x.pathname) === path(y.pathname) && x.search === y.search;
  } catch {
    return a === b;
  }
}
