import { browser } from '#imports';
import Defuddle from 'defuddle/full';
import type { RuntimeMessage } from '@/lib/messages';

browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type !== 'extract') return;
  try {
    const doc = new DOMParser().parseFromString(message.html, 'text/html');
    const { content } = new Defuddle(doc, { url: message.url, markdown: true, removeImages: true }).parse();
    // Link targets cost tokens without helping the answer.
    sendResponse(content.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
  } catch {
    sendResponse(undefined);
  }
});
