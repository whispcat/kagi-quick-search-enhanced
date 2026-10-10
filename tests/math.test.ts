import { expect, test } from 'bun:test';
import { renderAnswer } from '../lib/render';

const render = (text: string) => renderAnswer(text, [], { sanitize: (h) => h });

test('renders inline and display LaTeX as MathML', () => {
  expect(render('Area is $\\pi r^2$.')).toContain('<math><mrow><mi>π</mi>');
  expect(render('$$\\frac{a}{b}$$')).toContain('<math display="block"');
  expect(render('Both \\(a+b\\) and \\[c\\] work.').match(/<math/g)?.length).toBe(2);
});

test('leaves prices and code alone', () => {
  expect(render('It costs $5 and $10, or $5-$10.')).toBe('<p>It costs $5 and $10, or $5-$10.</p>\n');
  expect(render('Use `$x$` literally.')).toContain('<code>$x$</code>');
});
