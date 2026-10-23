import { extractFeed, isFeed, type FeedMemory } from './feed';
import { extractGeneric, type Extracted } from './generic';

export { isWall } from './generic';

export type { Extracted } from './generic';
export { POST, newFeedMemory, type FeedMemory } from './feed';

export function extractPage(doc: Document, loc: Location, memory?: FeedMemory): Extracted {
  return isFeed(doc, loc) ? extractFeed(doc, loc, memory) : extractGeneric(doc, loc);
}
