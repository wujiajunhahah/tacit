// Tacit as a plain page script: the extension's background and content halves in one bundle.
// Used by the hosted demo (try it without installing) and by the extension-free browser tests.

import './web/install';
import { handle, load } from './background';
import { startContent } from './content';
import { setHandler, watchHistory } from './web/shim';

setHandler(async (msg, sender) => {
  await load();
  return handle(msg as Parameters<typeof handle>[0], sender as chrome.runtime.MessageSender);
});
watchHistory();

/** Marks the page first: an installed extension, which starts later (document_idle), then stays out. */
function start(): void {
  document.documentElement.dataset.tacit = 'web';
  void startContent();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
