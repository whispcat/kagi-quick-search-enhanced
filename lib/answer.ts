import { searchKagi } from './kagi';
import type { AskEvent, AskRequest, KagiItem, Source } from './messages';
import { chat, type ToolCall } from './openrouter';
import { buildMessages, formatSearchResults, searchTool } from './prompt';
import type { Settings } from './settings';
import { enrichSources, readPage, toSources, type Extract } from './sources';

interface Context {
  settings: Settings;
  extract: Extract;
  emit: (event: AskEvent) => void;
  signal: AbortSignal;
}

interface SearchResult {
  items: KagiItem[];
  contents: Map<string, string | undefined>;
}

function parseQueries(call: ToolCall): string[] {
  const args = JSON.parse(call.function.arguments || '{}');
  const queries: unknown[] = Array.isArray(args.queries) ? args.queries : [args.query];
  return queries.map((q) => String(q ?? '').trim()).filter(Boolean);
}

export async function answer(req: AskRequest, { settings, extract, emit, signal }: Context): Promise<void> {
  if (!settings.apiKey) {
    return emit({ type: 'error', message: 'Add your OpenRouter API key in the extension settings.', missingKey: true });
  }

  let sources: Source[];
  if (req.sources) sources = req.sources;
  else {
    emit({ type: 'status', status: 'reading' });
    const { extractCount: count, budgetMs } = settings;
    sources = await enrichSources(toSources(req.items ?? [], settings.snippetCount), { count, budgetMs, signal }, extract);
    emit({ type: 'sources', sources });
  }

  const turn = req.history.length;
  const maxSearchQueries = settings.kagiApiKey ? settings.maxSearchQueries : 0;
  const messages: object[] = buildMessages(settings.systemPrompt, sources, req.question, req.history, { maxSearchQueries });

  // Each query searches and then reads its own top pages, without waiting on the other queries.
  const runQuery = async (query: string, known: Set<string>, pages: Map<string, Promise<string | undefined>>): Promise<SearchResult> => {
    const items = await searchKagi(query, { apiKey: settings.kagiApiKey, lens: req.lens, limit: settings.searchResultCount, signal });
    const toRead = items.filter((item) => !known.has(item.url)).slice(0, settings.searchExtractCount);
    const read = (url: string) => {
      if (!pages.has(url)) pages.set(url, readPage(url, extract, { budgetMs: settings.budgetMs, signal }));
      return pages.get(url)!;
    };
    const contents = await Promise.all(toRead.map((item) => read(item.url)));
    return { items, contents: new Map(toRead.map((item, i) => [item.url, contents[i]])) };
  };

  const search = async (calls: ToolCall[]) => {
    let remaining = maxSearchQueries;
    const callQueries = calls.map((call) => {
      const queries = parseQueries(call).slice(0, remaining);
      remaining -= queries.length;
      return queries;
    });
    const queries = callQueries.flat();
    queries.forEach((query) => emit({ type: 'search', query }));

    const known = new Set(sources.map((s) => s.url));
    const pages = new Map<string, Promise<string | undefined>>();
    const results = await Promise.all(queries.map((q) => runQuery(q, known, pages).catch((error: Error) => error)));

    // Number in query order once everything is in, so citations stay unique and stable.
    const formatted = results.map((result, i) => {
      if (result instanceof Error) return `Search for "${queries[i]}" failed: ${result.message}`;
      const fresh: Source[] = toSources(result.items, settings.searchResultCount, sources, turn).map((s) => {
        const content = result.contents.get(s.url);
        return content ? { ...s, content } : s;
      });
      const repeated = sources.filter((s) => result.items.some((item) => item.url === s.url));
      sources = [...sources, ...fresh];
      return formatSearchResults(queries[i]!, fresh, repeated);
    });
    emit({ type: 'sources', sources });

    let next = 0;
    return calls.map((call, i) => {
      const count = callQueries[i]!.length;
      const content = count
        ? formatted.slice(next, (next += count)).join('\n\n')
        : `Skipped: at most ${maxSearchQueries} queries per answer.`;
      return { role: 'tool', tool_call_id: call.id, content };
    });
  };

  emit({ type: 'status', status: 'thinking' });
  for (let round = 0; ; round++) {
    const result = await chat(
      {
        model: settings.model,
        messages,
        reasoning: { effort: settings.effort },
        max_tokens: 8192,
        // One parallel search round per answer, then the model must answer.
        ...(maxSearchQueries > 0 && { tools: [searchTool(maxSearchQueries)], tool_choice: round === 0 ? 'auto' : 'none' }),
      },
      settings.apiKey,
      signal,
      (text) => emit({ type: 'delta', text }),
    );
    if (!result.toolCalls.length || round > 0) break;
    messages.push(
      {
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls,
        reasoning_details: result.reasoningDetails,
      },
      ...(await search(result.toolCalls)),
    );
    emit({ type: 'status', status: 'thinking' });
  }
  emit({ type: 'done' });
}
