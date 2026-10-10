import { browser, defineBackground } from '#imports';
import { answer } from '@/lib/answer';
import { PORT_NAME, type AskEvent, type AskRequest, type RuntimeMessage } from '@/lib/messages';
import { getSettings } from '@/lib/settings-store';

let offscreenReady: Promise<void> | undefined;

function ensureOffscreen(): Promise<void> {
  return (offscreenReady ??= browser.offscreen
    .hasDocument()
    .then((exists) =>
      exists
        ? undefined
        : browser.offscreen.createDocument({
            url: browser.runtime.getURL('/offscreen.html'),
            reasons: [browser.offscreen.Reason.DOM_PARSER],
            justification: 'Extract readable content from search result pages',
          }),
    )
    .catch((error) => {
      offscreenReady = undefined;
      throw error;
    }));
}

async function extract(html: string, url: string): Promise<string | undefined> {
  await ensureOffscreen();
  return browser.runtime.sendMessage({ type: 'extract', html, url } satisfies RuntimeMessage);
}

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    const abort = new AbortController();
    port.onDisconnect.addListener(() => abort.abort());
    port.onMessage.addListener((req: AskRequest) => {
      getSettings()
        .then((settings) => answer(req, { settings, extract, emit: (event) => port.postMessage(event), signal: abort.signal }))
        .catch((error) => {
          if (!abort.signal.aborted) port.postMessage({ type: 'error', message: String(error?.message ?? error) } satisfies AskEvent);
        })
        .finally(() => port.disconnect());
    });
  });

  browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === 'open-options') browser.runtime.openOptionsPage();
  });
});
