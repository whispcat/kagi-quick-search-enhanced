import hljs from 'highlight.js/lib/common';

/** highlight.js scopes mapped to the Pygments token classes Kagi's themes color. */
const PYGMENTS: Record<string, string> = {
  keyword: 'k',
  built_in: 'nb',
  type: 'kt',
  literal: 'kc',
  number: 'm',
  operator: 'o',
  punctuation: 'p',
  property: 'py',
  regexp: 'sr',
  string: 's',
  subst: 'si',
  symbol: 'ss',
  'char escape_': 'se',
  comment: 'c',
  quote: 'c1',
  doctag: 'sd',
  meta: 'cp',
  'meta prompt_': 'gp',
  section: 'gh',
  tag: 'nt',
  name: 'nt',
  attr: 'na',
  attribute: 'na',
  variable: 'nv',
  'template-variable': 'nv',
  'variable language_': 'bp',
  'variable constant_': 'no',
  title: 'nf',
  'title class_': 'nc',
  'title class_ inherited__': 'nc',
  'selector-tag': 'nt',
  'selector-id': 'nn',
  'selector-class': 'nc',
  'selector-attr': 'na',
  'selector-pseudo': 'nd',
  addition: 'gi',
  deletion: 'gd',
  emphasis: 'ge',
  strong: 'gs',
  code: 's',
  link: 'nl',
  bullet: 'p',
};

/** Renders a code block in the same codehilite markup Kagi's own quick answer uses. */
export function highlightCode(code: string, lang = ''): string {
  const language = hljs.getLanguage(lang) ? lang : 'plaintext';
  const tokens = hljs
    .highlight(code, { language, ignoreIllegals: true })
    .value.replace(/class="hljs-([^"]+)"/g, (_, scope: string) => {
      const token = PYGMENTS[scope] ?? PYGMENTS[scope.split(' ')[0]!];
      return token ? `class="${token}"` : '';
    });
  const label = language !== 'plaintext' ? hljs.getLanguage(language)!.name : /^[\w+#.-]+$/.test(lang) ? lang : 'Text';
  return `<div class="codehilite"><span class="filename">${label}</span><pre><span></span><code>${tokens}</code></pre></div>\n`;
}
