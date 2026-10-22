const { estimateTextTokens, estimateMessagesTokens } = require('../../src/lib/tokens');

describe('token estimates', () => {
  it('counts about four characters per token', () => {
    expect(estimateTextTokens('')).toBe(0);
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimateTextTokens('abcde')).toBe(2);
  });

  it('adds per-message overhead and reads text parts', () => {
    const tokens = estimateMessagesTokens([
      { role: 'system', content: 'abcd' },
      { role: 'user', content: [{ type: 'text', text: 'abcdefgh' }] },
    ]);

    expect(tokens).toBe(4 + 1 + 4 + 2);
  });
});
