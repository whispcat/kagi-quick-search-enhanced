const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Yields the `data:` payloads of a server-sent event stream. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop()!;
    for (const line of lines) if (line.startsWith('data:')) yield line.slice(5).trim();
  }
  if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  /** Must be sent back with tool calls so Claude keeps its thinking across rounds. */
  reasoningDetails: unknown[];
}

interface Delta {
  content?: string;
  reasoning_details?: unknown[];
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
}

/** Streams an OpenRouter chat completion, passing text deltas to `onText`. */
export async function chat(
  body: object,
  apiKey: string,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<ChatResult> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Kagi Quick Answer Enhanced',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().then((j) => j?.error?.message, () => undefined);
    throw new Error(`OpenRouter ${res.status}: ${detail ?? res.statusText}`);
  }
  const result: ChatResult = { content: '', toolCalls: [], reasoningDetails: [] };
  for await (const data of sseData(res.body)) {
    if (data === '[DONE]') break;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(`OpenRouter: ${chunk.error.message}`);
    const delta: Delta = chunk.choices?.[0]?.delta ?? {};
    if (delta.content) {
      result.content += delta.content;
      onText(delta.content);
    }
    result.reasoningDetails.push(...(delta.reasoning_details ?? []));
    for (const { index, id, function: fn } of delta.tool_calls ?? []) {
      const call = (result.toolCalls[index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } });
      if (id) call.id = id;
      call.function.name += fn?.name ?? '';
      call.function.arguments += fn?.arguments ?? '';
    }
  }
  return result;
}
