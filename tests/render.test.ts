import { describe, expect, test } from 'bun:test';
import type { Source } from '../lib/messages';
import { citationHref, expandCitations, renderAnswer, splitFollowups } from '../lib/render';

const sources: Source[] = [
  { n: 1, title: 'Sky <Blue>', url: 'https://a.com/sky', domain: 'a.com', snippet: 'Light from the sun is scattered by air molecules ... more' },
  { n: 2, title: 'Rayleigh', url: 'https://b.org/r#top', domain: 'b.org', snippet: 'Short' },
];

describe('splitFollowups', () => {
  test('parses a complete block', () => {
    const { answer, followups } = splitFollowups('Answer.\n\n<followups>\n- One?\n2. Two?\nThree?\n</followups>');
    expect(answer).toBe('Answer.');
    expect(followups).toEqual(['One?', 'Two?', 'Three?']);
  });

  test('hides a partially streamed tag', () => {
    expect(splitFollowups('Answer.\n<follo').answer).toBe('Answer.\n');
    expect(splitFollowups('a < b').answer).toBe('a < b');
  });
});

describe('citations', () => {
  test('builds a text fragment from the first snippet passage', () => {
    expect(citationHref(sources[0]!.url, sources[0]!.snippet)).toBe(
      'https://a.com/sky#:~:text=Light%20from%20the,by%20air%20molecules',
    );
    expect(citationHref(sources[1]!.url, sources[1]!.snippet)).toBe('https://b.org/r#top');
  });

  test('expands markers outside code and escapes source fields', () => {
    const html = expandCitations('<p>Blue [1][2] and [1, 2] but [9] and <code>a[1]</code></p>', sources, () => 'icon.png');
    expect(html.match(/<sup class="trigger">/g)?.length).toBe(4);
    expect(html).toContain('[9]');
    expect(html).toContain('<code>a[1]</code>');
    expect(html).toContain('<b>1. Sky &#60;Blue&#62;</b>');
    expect(html).toContain('<img alt="" src="icon.png">a.com');
  });

  test('renders code blocks as Kagi codehilite markup without citing inside code', () => {
    const html = renderAnswer('```python\nimport json\nx = a[1]  # note\n```\n\nUse `json` [1].', sources, { sanitize: (h) => h });
    expect(html).toStartWith('<div class="codehilite"><span class="filename">Python</span><pre><span></span><code><span class="k">import</span> json');
    expect(html).toContain('<span class="c"># note</span>');
    expect(html).toContain('a[<span class="m">1</span>]');
    expect(html.match(/<sup class="trigger">/g)?.length).toBe(1);
  });

  test('falls back to plain text for unknown languages', () => {
    expect(renderAnswer('```zig\nconst x = 1 < 2;\n```', [], { sanitize: (h) => h })).toContain('<span class="filename">zig</span><pre><span></span><code>const x = 1 &lt; 2;');
    expect(renderAnswer('```"><img>\nx\n```', [], { sanitize: (h) => h })).toContain('<span class="filename">Text</span>');
  });

  test('accepts footnote-style citations', () => {
    expect(expandCitations('<p>333 m[^1].</p>', sources).match(/<sup class="trigger">/g)?.length).toBe(1);
  });

  test('renders markdown before expanding', () => {
    const html = renderAnswer('**Bold** claim [2].', sources, { sanitize: (h) => h });
    expect(html).toStartWith('<p><strong>Bold</strong> claim <sup class="trigger"><a href="https://b.org/r#top">2</a>');
  });
});
