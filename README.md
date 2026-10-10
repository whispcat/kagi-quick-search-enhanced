# Kagi Quick Answer Enhanced

A Chrome extension that replaces Kagi's Quick Answer with an answer from a model you pick on OpenRouter. It answers from the results on your search page, cites them the way Kagi does, and takes follow-up questions in place.

## How it works

Quick Answer opens the same ways as before: the Quick Answer button, a query ending in `?`, or the `q` hotkey. The extension catches Kagi's request before it is sent and builds the answer itself:

1. It passes the top 20 results as snippets and reads the top 5 pages in full with [Defuddle](https://github.com/kepano/defuddle). A page that takes longer than 2.5 seconds falls back to its snippet.
2. It sends them to OpenRouter (`anthropic/claude-sonnet-5.5` by default) and streams the answer into Kagi's quick answer box.
3. Citations, code blocks, and math use the same markup as Kagi's own answers, so your Kagi theme and custom CSS apply to them.

You can type a follow-up question or click one of three suggestions, and the answer appears on the same page using the same sources. The thread survives reloads until you close the tab. If you add a Kagi API key, the model can also run up to 3 extra searches in parallel when the page's results fall short.

## Install

With [Bun](https://bun.sh) installed:

```sh
bun install
bun run build
```

Open `chrome://extensions`, turn on Developer mode, and load `.output/chrome-mv3` as an unpacked extension. Then open the extension's options and add your OpenRouter API key.

## Settings

The options page covers the model, reasoning effort, system prompt, how many pages to read and for how long, and the Kagi API key for extra searches. Any setting left at its default picks up new defaults in later versions.

## Privacy

Your query, the search results, and the page text go to OpenRouter and from there to the model provider. Result pages are fetched without your cookies. API keys stay in the extension's local storage and background worker.

## Development

```sh
OPENROUTER_TEST_API_KEY=... KAGI_TEST_API_KEY=... bun run dev
bun test
bun run check
```

Development builds fall back to these environment keys when no key is saved in the options. Production builds never include them.

## License

[MIT](LICENSE)
