// What every dashboard view gives the router, and what the router gives back.

import type { HealthResponse } from '../../core';

export interface App {
  health: HealthResponse | null;
  /** The library's last search, so returning from a page lands on the same list. */
  libraryHash: string;
  refreshStatus(): Promise<void>;
}

export interface Rendered {
  node: Node;
  /** Polled views skip re-rendering while this stays the same. */
  key?: string;
}

export interface View {
  render(params: URLSearchParams, app: App): Promise<Rendered>;
  poll?: boolean;
}
