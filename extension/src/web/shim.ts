// A tiny stand-in for the extension APIs, so Tacit can run as a plain script on a page:
// storage lives in localStorage, messages are direct calls, and nothing touches the network.

type Listener = (...args: any[]) => unknown;

function event() {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener: (fn: Listener) => void listeners.push(fn),
    removeListener: (fn: Listener) => void listeners.splice(listeners.indexOf(fn) >>> 0, 1),
    hasListener: (fn: Listener) => listeners.includes(fn),
  };
}

export type Handler = (msg: unknown, sender: { tab: { id: number } }) => Promise<unknown>;

let handler: Handler | null = null;

/** The background module registers its message handler here. */
export function setHandler(h: Handler): void {
  handler = h;
}

const changed = event();

function area(name: 'local' | 'session', store: Storage) {
  const key = (k: string) => `tacit-web:${name}:${k}`;
  return {
    async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
      const list = keys == null ? [] : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) {
        const raw = store.getItem(key(k));
        if (raw != null) out[k] = JSON.parse(raw);
      }
      return out;
    },
    async set(items: Record<string, unknown>): Promise<void> {
      const changes: Record<string, { oldValue?: unknown; newValue: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        const old = store.getItem(key(k));
        store.setItem(key(k), JSON.stringify(v));
        changes[k] = { oldValue: old == null ? undefined : JSON.parse(old), newValue: v };
      }
      queueMicrotask(() => changed.listeners.forEach((fn) => fn(changes, name)));
    },
  };
}

const onMessage = event();
const historyUpdated = event();

export const chromeShim = {
  runtime: {
    id: 'web',
    onMessage,
    async sendMessage(msg: unknown): Promise<unknown> {
      if (!handler) throw new Error('Tacit web runtime: no handler');
      return handler(msg, { tab: { id: 1 } });
    },
  },
  storage: { local: area('local', localStorage), session: area('session', sessionStorage), onChanged: changed },
  i18n: { getUILanguage: () => navigator.language },
  tabs: { onCreated: event(), onRemoved: event(), sendMessage: async () => undefined },
  webNavigation: { onCommitted: event(), onBeforeNavigate: event(), onHistoryStateUpdated: historyUpdated },
};

/** Single-page navigations reach the background and the page script the way the browser would report them. */
export function watchHistory(): void {
  const emit = () =>
    setTimeout(() => {
      const url = location.href;
      historyUpdated.listeners.forEach((fn) => fn({ frameId: 0, tabId: 1, url, transitionQualifiers: [] }));
      onMessage.listeners.forEach((fn) => fn({ type: 'tacit:navigated', url }, { id: 'web' }, () => undefined));
    }, 0);
  for (const name of ['pushState', 'replaceState'] as const) {
    const original = history[name].bind(history);
    history[name] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      emit();
    };
  }
  window.addEventListener('popstate', emit);
}

export function install(): void {
  const g = globalThis as unknown as { chrome?: unknown; __TACIT_WEB__?: boolean };
  g.__TACIT_WEB__ = true;
  g.chrome = chromeShim;
}
