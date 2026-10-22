import { describe, expect, it } from 'vitest';
import { prepareMarkdown } from './markdownText.js';

describe('prepareMarkdown', () => {
  it('keeps prices as text instead of turning them into math', () => {
    expect(prepareMarkdown('It costs $5 and $10 per month.')).toBe(
      'It costs \\$5 and \\$10 per month.',
    );
    expect(prepareMarkdown('Pay $5, then $5.')).toBe('Pay \\$5, then \\$5.');
  });

  it('keeps real inline math', () => {
    expect(prepareMarkdown('Algebra ($x + 5 = 10$).')).toBe('Algebra ($x + 5 = 10$).');
    expect(prepareMarkdown('Use $2^{10}$ here')).toBe('Use $2^{10}$ here');
  });

  it('converts LaTeX bracket delimiters to dollar math', () => {
    expect(prepareMarkdown('Inline \\( a^2 + b^2 \\) and')).toBe('Inline $a^2 + b^2$ and');
    expect(prepareMarkdown('\\[\\int_0^1 x\\,dx\\]')).toBe('$$\\int_0^1 x\\,dx$$');
  });

  it('leaves code and display math untouched', () => {
    const code = '```bash\necho "$HOME costs $5"\n```';
    expect(prepareMarkdown(code)).toBe(code);
    expect(prepareMarkdown('Run `echo $PATH` now')).toBe('Run `echo $PATH` now');
    expect(prepareMarkdown('$$a + b$$')).toBe('$$a + b$$');
  });

  it('does not double-escape dollars the model already escaped', () => {
    expect(prepareMarkdown('Only \\$3 today')).toBe('Only \\$3 today');
  });
});
