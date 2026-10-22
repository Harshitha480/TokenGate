const { generateApiKey, hashApiKey, looksLikeApiKey } = require('../../src/lib/apiKeyCrypto');

describe('api key crypto', () => {
  it('generates prefixed, URL-safe keys with a matching hash', () => {
    const { plaintextKey, keyHash, prefix, lastFour } = generateApiKey();

    expect(plaintextKey).toMatch(/^tg_live_[A-Za-z0-9_-]{32}$/);
    expect(keyHash).toBe(hashApiKey(plaintextKey));
    expect(prefix).toBe(plaintextKey.slice(0, 12));
    expect(lastFour).toBe(plaintextKey.slice(-4));
  });

  it('never generates the same key twice', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateApiKey().plaintextKey));

    expect(keys.size).toBe(1000);
  });

  it('recognises only well-formed keys', () => {
    expect(looksLikeApiKey(generateApiKey().plaintextKey)).toBe(true);
    expect(looksLikeApiKey('sk-openai-style-key')).toBe(false);
    expect(looksLikeApiKey(undefined)).toBe(false);
  });
});
