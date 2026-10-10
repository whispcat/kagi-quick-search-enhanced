import type { KagiItem } from './messages';

const ENDPOINT = 'https://kagi.com/api/v1/search';

export async function searchKagi(
  query: string,
  { apiKey, lens, limit, signal }: { apiKey: string; lens?: string; limit: number; signal: AbortSignal },
): Promise<KagiItem[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, lens_id: lens, limit }),
    signal,
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok || !json?.data) {
    throw new Error(`Kagi search ${res.status}: ${json?.errors?.[0]?.message ?? res.statusText}`);
  }
  return (json.data.search ?? []).map((r: { title: string; url: string; snippet?: string }, i: number) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet ?? '',
    rank: i + 1,
    source: new URL(r.url).hostname,
  }));
}
