import { expect, test } from 'bun:test';
import { decodeEntities, enrichSources, toSources } from '../lib/sources';

const item = (rank: number, url: string) => ({ title: `T&amp;${rank}`, url, snippet: 'It&#39;s &quot;x&quot;', rank, source: 'x.com' });

test('decodes entities', () => {
  expect(decodeEntities('&lt;a&gt; &#x27;b&#39; &unknown;')).toBe(`<a> 'b' &unknown;`);
});

test('dedupes, orders by rank, numbers from 1', () => {
  const sources = toSources([item(2, 'https://x.com/2'), item(1, 'https://x.com/1'), item(3, 'https://x.com/1')], 5);
  expect(sources.map((s) => [s.n, s.url])).toEqual([[1, 'https://x.com/1'], [2, 'https://x.com/2']]);
  expect(sources[0]!.title).toBe('T&1');
  expect(sources[0]!.snippet).toBe(`It's "x"`);
});

test('continues numbering after known sources and strips markup', () => {
  const known = toSources([item(1, 'https://x.com/1')], 5);
  const more = toSources([{ ...item(1, 'https://x.com/1') }, { ...item(2, 'https://x.com/3'), snippet: '<strong>bold</strong> &amp; more' }], 5, known, 2);
  expect(more).toEqual([{ n: 2, title: 'T&2', url: 'https://x.com/3', domain: 'x.com', snippet: 'bold & more', turn: 2 }]);
});

test('falls back to snippets for pages that miss the budget', async () => {
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (new URL(req.url).pathname === '/slow') await Bun.sleep(500);
      return new Response('<html><body>page</body></html>', { headers: { 'content-type': 'text/html' } });
    },
  });
  const sources = toSources([item(1, `${server.url}fast`), item(2, `${server.url}slow`), item(3, `${server.url}skip`)], 3);
  const enriched = await enrichSources(sources, { count: 2, budgetMs: 200, signal: new AbortController().signal }, async (html) => html.length + ' chars');
  server.stop(true);
  expect(enriched.map((s) => s.content)).toEqual(['30 chars', undefined, undefined]);
});
