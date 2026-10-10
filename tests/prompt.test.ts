import { expect, test } from 'bun:test';
import type { Source } from '../lib/messages';
import { buildMessages, DEFAULT_SYSTEM_PROMPT } from '../lib/prompt';

type Block = { type: string; text: string; cache_control?: object };

const sources: Source[] = [
  { n: 1, title: 'A "quoted" title', url: 'https://a.com', domain: 'a.com', snippet: 's' },
  { n: 2, title: 'Found', url: 'https://b.com', domain: 'b.com', snippet: 'found later', turn: 1 },
];

test('interleaves history after the cached sources and places searched sources in their turn', () => {
  const messages = buildMessages('Be brief.', sources, 'third', [
    { question: 'first', answer: 'one' },
    { question: 'second', answer: 'two', searches: ['b things'] },
  ]);
  expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user']);

  const [initial, query] = messages[1]!.content as Block[];
  expect(initial!.cache_control).toEqual({ type: 'ephemeral' });
  expect(initial!.text).toContain(`title="A 'quoted' title"`);
  expect(initial!.text).not.toContain('found later');
  expect(query!.text).toBe('Query: first');

  const [found, second] = messages[3]!.content as Block[];
  expect(found!.text).toStartWith('Results from searching "b things":');
  expect(found!.text).toContain('n="2"');
  expect(second!.text).toBe('second');

  const last = messages[5]!.content as Block[];
  expect(last).toEqual([{ type: 'text', text: 'third', cache_control: { type: 'ephemeral' } }]);
  expect(messages[0]!.content).not.toContain('web_search');
});

test('mentions the search tool only when searching is available', () => {
  expect(buildMessages('x', sources, 'q', [], { maxSearchQueries: 2 })[0]!.content).toContain('up to 2 queries that run in parallel');
  expect(buildMessages('x', sources, 'q', [], { maxSearchQueries: 1 })[0]!.content).toContain('with one query');
});

test('keeps display-math delimiters in the default prompt', () => {
  expect(DEFAULT_SYSTEM_PROMPT).toContain('$$...$$ display');
});
