// Shared vocabulary of the harness: what a page, a visit and an intent look like.

export type BlockKind = 'heading' | 'para' | 'item' | 'code' | 'quote';

/** A readable chunk of a page. Feed posts are 'item' blocks. */
export interface Block {
  id: string;
  kind: BlockKind;
  text: string;
  level?: number;
  /** Nearest heading above this block, or the author for feed items. */
  section: string;
}

export type ActionKind = 'link' | 'button' | 'jump' | 'copy';
export type Region = 'main' | 'nav' | 'header' | 'footer' | 'aside' | 'unknown';

/** Something the user can do next on a page. */
export interface Action {
  id: string;
  kind: ActionKind;
  label: string;
  href?: string;
  /** Text around the action that explains where it leads. */
  context: string;
  region: Region;
  visited?: boolean;
  /** For jump and copy actions: the block they refer to. */
  targetBlockId?: string;
  /** For copy actions: the text that goes on the clipboard. */
  payload?: string;
}

export interface OutlineEntry {
  level: number;
  text: string;
  blockId: string;
}

export type PageKind = 'article' | 'feed' | 'repo' | 'search' | 'unknown';

/** What the harness knows about one page. */
export interface PageModel {
  url: string;
  title: string;
  domain: string;
  lang?: string;
  description?: string;
  kind: PageKind;
  blocks: Block[];
  actions: Action[];
  outline: OutlineEntry[];
  /** Characters of readable text on the page. */
  textLength: number;
}

export type ArrivalKind =
  | 'search'
  | 'link'
  | 'typed'
  | 'reload'
  | 'back_forward'
  | 'bookmark'
  | 'new_tab'
  | 'tacit'
  | 'unknown';

/** How the user got to a page. */
export interface Arrival {
  kind: ArrivalKind;
  fromUrl?: string;
  fromTitle?: string;
  /** Label of the link or button that led here. */
  viaLabel?: string;
  /** The query the user searched right before arriving. */
  searchQuery?: string;
}

export interface Moment {
  text: string;
  at: number;
}

export interface Click {
  label: string;
  href?: string;
  at: number;
}

/** One stay on one page. */
export interface Visit {
  id: string;
  url: string;
  title: string;
  domain: string;
  tabId?: number;
  startedAt: number;
  endedAt?: number;
  /** Time the page was visible and focused. */
  dwellMs: number;
  /** Deepest scroll position, 0..1. */
  maxScroll: number;
  arrival: Arrival;
  /** Query shown on this page when the page is itself a search results page. */
  searchQuery?: string;
  selections: Moment[];
  copies: Moment[];
  clicks: Click[];
  /** Intent the user picked explicitly. Always outranks inference. */
  statedIntent?: Moment;
}

export type EvidenceKind = 'stated' | 'search' | 'copy' | 'selection' | 'click' | 'dwell' | 'title';

export interface Evidence {
  kind: EvidenceKind;
  text: string;
  at: number;
  /** Contribution after time decay. */
  weight: number;
}

export interface IntentCandidate {
  text: string;
  p: number;
}

/** What the harness believes the user is trying to do right now. */
export interface Intent {
  text: string;
  /** Weighted query terms, max weight 1. */
  terms: Record<string, number>;
  confidence: number;
  source: 'stated' | 'inferred' | 'none';
  evidence: Evidence[];
  candidates: IntentCandidate[];
}

export interface Ranked<T> {
  item: T;
  score: number;
  /** Probability under the ranking's softmax. */
  p: number;
  /** Score divided by the best score on the page, 0..1. */
  relevance: number;
  reasons: string[];
}
