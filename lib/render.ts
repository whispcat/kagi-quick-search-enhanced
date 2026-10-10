import { Marked } from 'marked';
import { highlightCode } from './highlight';
import { blockMath, inlineMath } from './math';
import type { Source } from './messages';

const markdown = new Marked({
  extensions: [blockMath, inlineMath],
  renderer: {
    code: ({ text, lang }) => highlightCode(text, lang?.trim().split(/\s+/)[0]),
  },
});

const OPEN_TAG = '<followups>';
// Models sometimes write citations as Markdown footnotes ([^3]).
const CITATION = /\[\^?(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g;

/** Separates the trailing <followups> block from the answer, hiding a partially streamed tag. */
export function splitFollowups(text: string): { answer: string; followups: string[] } {
  const start = text.indexOf(OPEN_TAG);
  if (start === -1) {
    const lt = text.lastIndexOf('<');
    const partial = lt !== -1 && OPEN_TAG.startsWith(text.slice(lt));
    return { answer: partial ? text.slice(0, lt) : text, followups: [] };
  }
  const followups = text
    .slice(start + OPEN_TAG.length)
    .split('</followups>')[0]!
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return { answer: text.slice(0, start).trimEnd(), followups };
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Deep link to the snippet's first passage, the way Kagi builds its citation links. */
export function citationHref(url: string, snippet: string): string {
  if (url.includes('#')) return url;
  const words = snippet.split(/\.{2,}|…/)[0]!.split(/\s+/).filter(Boolean);
  if (words.length < 4) return url;
  const encode = (w: string[]) => encodeURIComponent(w.join(' ')).replace(/-/g, '%2D');
  const text = words.length <= 6 ? encode(words) : `${encode(words.slice(0, 3))},${encode(words.slice(-3))}`;
  return `${url}#:~:text=${text}`;
}

type FaviconLookup = (url: string) => string | undefined;

function citation(source: Source, favicon?: string): string {
  const href = escapeHtml(citationHref(source.url, source.snippet));
  const icon = favicon ? `<img alt="" src="${escapeHtml(favicon)}">` : '';
  return (
    `<sup class="trigger"><a href="${href}">${source.n}</a>` +
    `<span class="tooltip top center citation"><a href="${href}">` +
    `<span class="source">${icon}${escapeHtml(source.domain)}</span>` +
    `<b>${source.n}. ${escapeHtml(source.title)}</b></a>` +
    `<span class="passage">${escapeHtml(source.snippet)}</span></span></sup>`
  );
}

/** Turns [n] markers into Kagi's citation markup, leaving code untouched. */
export function expandCitations(html: string, sources: Source[], favicon: FaviconLookup = () => undefined): string {
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  return html
    .split(/(<code[\s\S]*?<\/code>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(CITATION, (match, list: string) => {
            const cited = list.split(',').map((n) => byNumber.get(Number(n)));
            return cited.every(Boolean) ? cited.map((s) => citation(s!, favicon(s!.url))).join(' ') : match;
          }),
    )
    .join('');
}

export function renderAnswer(
  text: string,
  sources: Source[],
  { sanitize, favicon }: { sanitize: (html: string) => string; favicon?: FaviconLookup },
): string {
  return expandCitations(sanitize(markdown.parse(text, { async: false })), sources, favicon);
}
