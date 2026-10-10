import { expect, test } from 'bun:test';
import { sseData } from '../lib/openrouter';

test('yields data payloads across chunk boundaries and skips comments', async () => {
  const chunks = [': OPENROUTER PROCESSING\n\ndata: {"a"', ':1}\r\n\ndata: [DONE]\n'];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  expect(await Array.fromAsync(sseData(body))).toEqual(['{"a":1}', '[DONE]']);
});
