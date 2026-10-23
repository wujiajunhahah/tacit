// The pairing page. `bun run pair` opens it with the token in the URL fragment, which browsers never send to a
// server. The page checks the token against this harness, unlocks the dashboard in this browser, and hands the token
// to the Tacit extension, which checks it again before keeping it: ready → pair → paired, over window messages.

const COPY = {
  en: {
    title: 'Pair Tacit',
    checking: 'Checking…',
    none: 'Open this page with `bun run pair`, in the tacit folder.',
    bad: 'This link does not open this harness. Run `bun run pair` again.',
    paired: 'This browser is paired: Tacit can reach your harness, and the dashboard is unlocked.',
    noExtension: 'The dashboard is unlocked, but the extension did not answer. Load it in chrome://extensions, then run `bun run pair` again.',
    open: 'Open your context library',
  },
  'zh-CN': {
    title: '配对 Tacit',
    checking: '正在检查…',
    none: '请在 tacit 文件夹里运行 `bun run pair` 来打开这个页面。',
    bad: '这个链接打不开这台电脑上的 harness。请重新运行 `bun run pair`。',
    paired: '这个浏览器已配对：Tacit 能连上你的 harness，面板也已解锁。',
    noExtension: '面板已解锁，但扩展没有回应。请在 chrome://extensions 里加载它，然后重新运行 `bun run pair`。',
    open: '打开你的上下文资料库',
  },
};

const SCRIPT = `
const zh = navigator.language.toLowerCase().startsWith('zh');
const T = ${JSON.stringify(COPY)}[zh ? 'zh-CN' : 'en'];
document.documentElement.lang = zh ? 'zh-CN' : 'en';
document.title = T.title;
document.getElementById('title').textContent = T.title;
const status = document.getElementById('status');
const open = document.getElementById('open');
open.textContent = T.open;
const say = (text) => { status.textContent = text; };
const token = location.hash.slice(1);
history.replaceState(null, '', '/pair');

let ready = false;
const waiting = [];
addEventListener('message', (e) => {
  if (e.source !== window || !e.data || e.data.type !== 'tacit:ready') return;
  ready = true;
  waiting.splice(0).forEach((f) => f());
});
const extension = () => new Promise((resolve) => {
  if (ready) return resolve(true);
  waiting.push(() => resolve(true));
  setTimeout(() => resolve(false), 3000);
});
const handOver = () => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 4000);
  addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'tacit:paired') return;
    clearTimeout(timer);
    resolve(!!e.data.ok);
  });
  postMessage({ type: 'tacit:pair', token }, location.origin);
});

(async () => {
  say(T.checking);
  if (!token) return say(T.none);
  const ok = await fetch('/v1/stats', { headers: { Authorization: 'Bearer ' + token } }).then((r) => r.ok, () => false);
  if (!ok) return say(T.bad);
  localStorage.setItem('tacit.token', token);
  const paired = (await extension()) && (await handOver());
  say(paired ? T.paired : T.noExtension);
  open.hidden = false;
})();
`;

const STYLE = `
:root { color-scheme: light dark; --ink: #17161c; --ink-2: rgba(23,22,28,.62); --paper: #fbfaf7; }
@media (prefers-color-scheme: dark) { :root { --ink: #efeef3; --ink-2: rgba(239,238,243,.62); --paper: #17161b; } }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--paper); color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", system-ui, sans-serif; }
main { max-width: 34em; padding: 32px; }
h1 { margin: 0 0 12px; font-size: 22px; font-weight: 600; }
p { margin: 0 0 20px; color: var(--ink-2); }
a { color: var(--ink); text-underline-offset: 3px; }
`;

export function renderPair(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tacit</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<h1 id="title">Tacit</h1>
<p id="status" role="status" aria-live="polite"></p>
<a id="open" href="/" hidden></a>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}
