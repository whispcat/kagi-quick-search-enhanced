import { afterEach, expect, test } from 'bun:test';
import { answer } from '../lib/answer';
import type { AskEvent, Source } from '../lib/messages';
import { DEFAULT_SETTINGS } from '../lib/settings';

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

const sse = (...chunks: object[]) =>
  new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n');
const toolCall = (index: number, id: string, args: object) => ({
  choices: [{ delta: { tool_calls: [{ index, id, function: { name: 'web_search', arguments: JSON.stringify(args) } }] } }],
});

const results: Record<string, { url: string; title: string; snippet: string }[]> = {
  'mars sky': [
    { url: 'https://a.com', title: 'Dup', snippet: 'old' },
    { url: 'https://mars.com', title: 'Mars <b>sky</b>', snippet: 'Dust makes it <strong>red</strong>' },
  ],
  'mars dust': [{ url: 'https://mars.com', title: 'Mars sky', snippet: 'again' }, { url: 'https://dust.org', title: 'Dust', snippet: 'fine' }],
  'mars sunset': [{ url: 'https://sunset.net', title: 'Blue sunsets', snippet: 'blue' }],
};

test('runs up to three queries in one parallel round, numbering new sources in query order', async () => {
  const bodies: any[] = [];
  const searched: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.includes('kagi.com/api')) {
      expect(body.lens_id).toBe('forums');
      searched.push(body.query);
      // The slowest search finishes last, yet numbering still follows query order.
      if (body.query === 'mars sky') await Bun.sleep(30);
      return Response.json({ data: { search: results[body.query] } });
    }
    bodies.push(body);
    return bodies.length === 1
      ? sse(
          { choices: [{ delta: { content: 'Let me check.' } }] },
          toolCall(0, 't1', { queries: ['mars sky', 'mars dust'] }),
          toolCall(1, 't2', { queries: ['mars sunset', 'over the cap'] }),
          toolCall(2, 't3', { queries: ['skipped'] }),
        )
      : sse({ choices: [{ delta: { content: 'Red [2].' } }] });
  }) as typeof fetch;

  const sources: Source[] = [{ n: 1, title: 'A', url: 'https://a.com', domain: 'a.com', snippet: 's' }];
  const events: AskEvent[] = [];
  await answer(
    { question: 'And Mars?', history: [{ question: 'q', answer: 'a' }], sources, lens: 'forums' },
    {
      settings: { ...DEFAULT_SETTINGS, apiKey: 'or', kagiApiKey: 'kagi', searchExtractCount: 0 },
      extract: async () => undefined,
      emit: (e) => events.push(e),
      signal: new AbortController().signal,
    },
  );

  expect(searched.sort()).toEqual(['mars dust', 'mars sky', 'mars sunset']);
  expect(events.map((e) => e.type)).toEqual(['status', 'delta', 'search', 'search', 'search', 'sources', 'status', 'delta', 'done']);
  const found = events.find((e) => e.type === 'sources') as Extract<AskEvent, { type: 'sources' }>;
  expect(found.sources.map((s) => [s.n, s.url, s.turn])).toEqual([
    [1, 'https://a.com', undefined],
    [2, 'https://mars.com', 1],
    [3, 'https://dust.org', 1],
    [4, 'https://sunset.net', 1],
  ]);
  expect(found.sources[1]!.snippet).toBe('Dust makes it red');

  const tools = bodies[1].messages.slice(-3);
  expect(tools.map((m: any) => m.tool_call_id)).toEqual(['t1', 't2', 't3']);
  expect(tools[0].content).toContain('Also matched existing sources [1].');
  expect(tools[0].content).toContain('New results for "mars dust"');
  expect(tools[0].content).toContain('Also matched existing sources [2].');
  expect(tools[1].content).toContain('n="4"');
  expect(tools[2].content).toStartWith('Skipped');
  expect(bodies[1].tool_choice).toBe('none');
  expect(bodies[0].tools[0].function.parameters.properties.queries.maxItems).toBe(3);
});

test.each([
  ['without a Kagi key', {}],
  ['when the limit is 0', { kagiApiKey: 'kagi', maxSearchQueries: 0 }],
])('does not offer search %s', async (_, overrides) => {
  let body: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return sse({ choices: [{ delta: { content: 'Hi' } }] });
  }) as typeof fetch;
  await answer(
    { question: 'q', history: [], sources: [] },
    { settings: { ...DEFAULT_SETTINGS, apiKey: 'or', ...overrides }, extract: async () => undefined, emit: () => {}, signal: new AbortController().signal },
  );
  expect(body.tools).toBeUndefined();
});
