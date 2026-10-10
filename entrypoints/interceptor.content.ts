import { defineContentScript } from '#imports';
import { TRIGGER_EVENT } from '@/lib/messages';

/**
 * Runs in Kagi's page world so it can catch Kagi's own quick answer request.
 * Every trigger path (button, trailing "?", `q` hotkey, `?qa=true`) ends in that call,
 * so hooking it keeps Kagi's trigger rules and user settings intact.
 */
export default defineContentScript({
  matches: ['https://kagi.com/search*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === '/mother/context' && init?.method === 'POST' && typeof init.body === 'string') {
        // Event detail must be a string to cross from the page world to the extension world.
        document.dispatchEvent(new CustomEvent(TRIGGER_EVENT, { detail: init.body }));
        // An empty stream makes Kagi's reader open and close without touching the UI.
        return Promise.resolve(new Response('', { status: 200 }));
      }
      return nativeFetch.call(this, input, init);
    };
  },
});
