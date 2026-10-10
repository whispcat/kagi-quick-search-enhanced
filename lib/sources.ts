import type { KagiItem, Source } from './messages';

const MAX_CONTENT_CHARS = 12_000;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? match;
    const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isNaN(point) ? match : String.fromCodePoint(point);
  });
}

const plainText = (html: string) => decodeEntities(html.replace(/<[^>]*>/g, ''));

/** Numbers results after `known` sources, skipping URLs that are already known. */
export function toSources(items: KagiItem[], limit: number, known: Source[] = [], turn?: number): Source[] {
  const seen = new Set(known.map((s) => s.url));
  return items
    .filter((item) => item.url && !seen.has(item.url) && seen.add(item.url))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((item, i) => ({
      n: known.length + i + 1,
      title: plainText(item.title),
      url: item.url,
      domain: item.source || new URL(item.url).hostname,
      snippet: plainText(item.snippet ?? ''),
      ...(turn === undefined ? {} : { turn }),
    }));
}

export type Extract = (html: string, url: string) => Promise<string | undefined>;

async function fetchContent(url: string, extract: Extract, signal: AbortSignal): Promise<string | undefined> {
  const res = await fetch(url, { credentials: 'omit', redirect: 'follow', signal });
  if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) return;
  const markdown = (await extract(await res.text(), res.url))?.trim();
  return markdown ? markdown.slice(0, MAX_CONTENT_CHARS) : undefined;
}

/** Fetches and extracts a page, giving up once the budget runs out. */
export function readPage(
  url: string,
  extract: Extract,
  { budgetMs, signal }: { budgetMs: number; signal: AbortSignal },
): Promise<string | undefined> {
  const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(budgetMs)]);
  const deadline = new Promise<undefined>((resolve) => setTimeout(resolve, budgetMs));
  return Promise.race([fetchContent(url, extract, fetchSignal).catch(() => undefined), deadline]);
}

/** Replaces the top `count` snippets with extracted page content where it arrives in time. */
export async function enrichSources(
  sources: Source[],
  { count, ...options }: { count: number; budgetMs: number; signal: AbortSignal },
  extract: Extract,
): Promise<Source[]> {
  const contents = await Promise.all(sources.slice(0, count).map((s) => readPage(s.url, extract, options)));
  return sources.map((s, i) => (contents[i] ? { ...s, content: contents[i] } : s));
}
