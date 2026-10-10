import { defineConfig } from 'wxt';
import type { Plugin } from 'vite';

// Defuddle builds retry selectors from raw element ids, so an id like "2026-article" makes querySelector throw
// and the whole extraction fall back to the unfiltered page body. Remove once fixed upstream.
const escapeDefuddleIds = (): Plugin => ({
  name: 'escape-defuddle-ids',
  transform(code, id) {
    if (!id.includes('/defuddle/dist/index.full.js')) return;
    const unescaped = 'if(r.id)t+="#"+r.id;';
    if (!code.includes(unescaped)) throw new Error('Defuddle changed; review the escape-defuddle-ids plugin');
    return code.replace(unescaped, 'if(r.id)t+="#"+CSS.escape(r.id);');
  },
});

export default defineConfig({
  manifest: {
    name: 'Kagi Quick Answer Enhanced',
    permissions: ['storage', 'offscreen'],
    host_permissions: ['<all_urls>'],
  },
  vite: ({ mode }) => ({
    plugins: [escapeDefuddleIds()],
    build: {
      // Chrome rejects content scripts containing Unicode noncharacters, which minifiers emit by unescaping regexes.
      rolldownOptions: { output: { minify: { compress: true, mangle: true, codegen: { asciiOnly: true } } } },
    },
    define: {
      __DEV_OPENROUTER_KEY__: JSON.stringify(mode === 'development' ? (process.env.OPENROUTER_TEST_API_KEY ?? '') : ''),
      __DEV_KAGI_KEY__: JSON.stringify(mode === 'development' ? (process.env.KAGI_TEST_API_KEY ?? '') : ''),
    },
  }),
});
