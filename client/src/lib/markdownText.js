// Model answers mix Markdown, LaTeX and plain prices. These steps run before the
// Markdown parser so each one renders as the model meant it.

// Fenced code, inline code and $$ display math are passed through untouched.
const PROTECTED = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`|\$\$[\s\S]*?\$\$)/g;

const isSpace = (char) => char === undefined || /\s/.test(char);
const isDigit = (char) => char !== undefined && /[0-9]/.test(char);

/**
 * Escapes every `$` that cannot be inline math under Pandoc's rule: an opening `$`
 * must be followed by a non-space, and a closing `$` must follow a non-space and
 * not be followed by a digit. "It costs $5 and $10" stays money; "$x + 5 = 10$"
 * stays math.
 */
function escapeNonMathDollars(line) {
  const chars = [...line];
  const keep = new Set();

  for (let open = 0; open < chars.length; open += 1) {
    if (chars[open] !== '$' || chars[open - 1] === '\\' || keep.has(open)) continue;
    if (isSpace(chars[open + 1])) continue;
    for (let close = open + 2; close < chars.length; close += 1) {
      if (chars[close] !== '$' || chars[close - 1] === '\\') continue;
      if (!isSpace(chars[close - 1]) && !isDigit(chars[close + 1])) {
        keep.add(open);
        keep.add(close);
        open = close;
      }
      break;
    }
  }

  return chars
    .map((char, index) =>
      char === '$' && chars[index - 1] !== '\\' && !keep.has(index) ? '\\$' : char,
    )
    .join('');
}

function prepareProse(text) {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, body) => `$$${body}$$`)
    .replace(/\\\((.+?)\\\)/g, (_match, body) => `$${body.trim()}$`)
    .split(PROTECTED)
    .map((part, index) =>
      index % 2 === 1 ? part : part.split('\n').map(escapeNonMathDollars).join('\n'),
    )
    .join('');
}

/** Prepares a model answer for the Markdown renderer. */
export function prepareMarkdown(text) {
  return text
    .split(PROTECTED)
    .map((part, index) => (index % 2 === 1 ? part : prepareProse(part)))
    .join('');
}
