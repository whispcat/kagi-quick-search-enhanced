import type { TokenizerAndRendererExtension } from 'marked';
import temml from 'temml';

/** LaTeX to native MathML, the same format Kagi's own quick answer uses. */
const renderTex = (tex: string, displayMode: boolean) => temml.renderToString(tex.trim(), { displayMode, throwOnError: false });

// `$` must hug its content and not close before a digit, so prices like "$5 and $10" stay text.
const INLINE = [/^\$\$([\s\S]+?)\$\$/, /^\\\[([\s\S]+?)\\\]/, /^\\\(([\s\S]+?)\\\)/, /^\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/];
const BLOCK = [/^ {0,3}\$\$([\s\S]+?)\$\$ *(?:\n+|$)/, /^ {0,3}\\\[([\s\S]+?)\\\] *(?:\n+|$)/];

export const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => src.match(/\$\$|\\\[/)?.index,
  tokenizer(src) {
    for (const pattern of BLOCK) {
      const match = pattern.exec(src);
      if (match) return { type: 'blockMath', raw: match[0], text: match[1]! };
    }
  },
  renderer: (token) => `<p>${renderTex(token.text, true)}</p>\n`,
};

export const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => src.match(/\$|\\[[(]/)?.index,
  tokenizer(src) {
    for (const [i, pattern] of INLINE.entries()) {
      const match = pattern.exec(src);
      if (match) return { type: 'inlineMath', raw: match[0], text: match[1]!, display: i < 2 };
    }
  },
  renderer: (token) => renderTex(token.text, token.display),
};
