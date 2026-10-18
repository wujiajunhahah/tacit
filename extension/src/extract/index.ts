import { extractFeed, isFeed } from './feed';
import { extractGeneric, type Extracted } from './generic';

export type { Extracted } from './generic';

export function extractPage(doc: Document, loc: Location): Extracted {
  return isFeed(doc, loc) ? extractFeed(doc, loc) : extractGeneric(doc, loc);
}
