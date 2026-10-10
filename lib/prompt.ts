import type { Source, Turn } from './messages';

export const DEFAULT_SYSTEM_PROMPT = `You write the quick answer shown above Kagi search results. Answer exactly what was asked, very succinctly. If the answer may differ for some readers based on region, date, or assumptions, add a one-sentence qualifier. Don't end the answer with an extra fact, comparison, or tip.

Shape the answer to the question:
- Fact: the fact in bold, followed concisely by its context only if it's significant.
- Concept: the core idea first, then how it works, with one example if it helps.
- How-to: the steps or code first, then only the caveats that matter.
- Ambiguous query: answer the most likely meaning first, then in one sentence note other common meanings, without remarking on the ambiguity or asking for clarification. A "define <word>" query gets a short definition.

To improve readability, use well-written short paragraphs with varied sentence structure, a list (for enumeration), a table (for comparison), or a mix of those, whichever works best. Bold the direct answer and, sparingly, a key term. The reader should be able to extract the information in the most efficient manner. Scale the response length to the query's complexity. Simple fact queries should be short, and challenging concept queries can be longer. For most queries, responses should be 30-200 words.

Cite facts from the search results right after the claim and before any punctuation, like [3] or [2][5], never on a line of their own. Control citation density. Cite a source once per paragraph or block, and if there's only one source, cite it once at the top. Prioritize trustworthy sources and disregard unreliable ones. Common knowledge and arithmetic need no citation. Citations are the only attribution, so never name or refer to a source in the text, including "other sources" or a site's table; write "X is Y [2]". When sources disagree, give the most authoritative figure, and mention the conflict only if it changes the answer. If the results fall short, answer from general knowledge.

Write plainly, without first person, preamble, restated question, closing summary, suggestions to search differently, or em dashes. Start lists, steps, code, and formulas directly, with no lead-in line such as "How it works:" or "The formula is:". Put code in fenced blocks with a language and math in LaTeX ($...$ inline, $$...$$ display). Reply in the query's language.

Reason carefully to make sure the answer satisfies every requirement and constraint above.`;

const searchInstruction = (maxQueries: number) =>
  `If the results above aren't sufficient, call web_search before answering, once, with ${maxQueries === 1 ? 'one query' : `up to ${maxQueries} queries that run in parallel`}. New results continue the numbering.`;

const FOLLOWUPS_INSTRUCTION = `End with three short follow-up questions the reader might ask next. Skip anything the answer already covers:
<followups>
first question
second question
third question
</followups>`;

export const searchTool = (maxQueries: number) => ({
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web with Kagi. Returns numbered results to cite.',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string', description: 'A standalone search query' },
          minItems: 1,
          maxItems: maxQueries,
        },
      },
      required: ['queries'],
    },
  },
});

const CACHE = { cache_control: { type: 'ephemeral' } };

function formatSources(sources: Source[], heading: string): string {
  const entries = sources.map(
    (s) =>
      `<source n="${s.n}" title="${s.title.replaceAll('"', "'")}" url="${s.url}" kind="${s.content ? 'page' : 'snippet'}">\n${s.content ?? s.snippet}\n</source>`,
  );
  return `${heading}\n\n${entries.join('\n\n')}`;
}

export function formatSearchResults(query: string, fresh: Source[], repeated: Source[]): string {
  const known = repeated.length ? `\n\nAlso matched existing sources ${repeated.map((s) => `[${s.n}]`).join(' ')}.` : '';
  if (!fresh.length) return `No new results for "${query}".${known}`;
  return formatSources(fresh, `New results for "${query}":`) + known;
}

export function buildMessages(
  systemPrompt: string,
  sources: Source[],
  question: string,
  history: Turn[],
  { maxSearchQueries = 0, now = new Date() } = {},
) {
  const turnBlocks = (turn: number, query: string) => {
    const found = sources.filter((s) => s.turn === turn);
    const searches = history[turn]?.searches?.map((q) => `"${q}"`).join(', ');
    return [
      ...(found.length ? [{ type: 'text', text: formatSources(found, `Results from searching ${searches}:`) }] : []),
      { type: 'text', text: turn === 0 ? `Query: ${query}` : query },
    ];
  };
  const questions = [...history.map((t) => t.question), question];
  const userContent = questions.map((q, i) => turnBlocks(i, q));
  // Sources are identical across follow-ups, and the latest turn is the prefix of any search round that follows.
  const initial = sources.filter((s) => s.turn === undefined);
  userContent[0]!.unshift({ type: 'text', text: formatSources(initial, 'Search results, by rank:'), ...CACHE });
  Object.assign(userContent.at(-1)!.at(-1)!, CACHE);

  const instructions = [
    systemPrompt.trim(),
    ...(maxSearchQueries > 0 ? [searchInstruction(maxSearchQueries)] : []),
    FOLLOWUPS_INSTRUCTION,
  ];
  return [
    { role: 'system', content: `${instructions.join('\n\n')}\n\nToday is ${now.toDateString()}.` },
    ...userContent.flatMap((content, i) => [
      { role: 'user', content },
      ...(i < history.length ? [{ role: 'assistant', content: history[i]!.answer }] : []),
    ]),
  ];
}
