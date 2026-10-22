const { buildCacheKey, isCacheable } = require('../../src/services/cache/cacheKey');

const userId = '64b7f0c2a1b2c3d4e5f60718';
const request = {
  model: 'gpt-oss-20b',
  messages: [{ role: 'user', content: 'Hello' }],
  temperature: 0,
  max_tokens: 100,
};

describe('buildCacheKey', () => {
  it('is a stable SHA-256 hex digest', () => {
    const key = buildCacheKey(userId, request);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(buildCacheKey(userId, { ...request })).toBe(key);
  });

  it('ignores the order of object keys', () => {
    const reordered = {
      max_tokens: 100,
      temperature: 0,
      messages: [{ content: 'Hello', role: 'user' }],
      model: 'gpt-oss-20b',
    };

    expect(buildCacheKey(userId, reordered)).toBe(buildCacheKey(userId, request));
  });

  it.each([
    ['model', { model: 'nemotron-3-ultra' }],
    ['messages', { messages: [{ role: 'user', content: 'Hello!' }] }],
    ['temperature', { temperature: 0.2 }],
    ['max_tokens', { max_tokens: 101 }],
    ['top_p', { top_p: 0.5 }],
    ['reasoning settings', { chat_template_kwargs: { enable_thinking: true } }],
  ])('changes when %s changes', (_field, change) => {
    expect(buildCacheKey(userId, { ...request, ...change })).not.toBe(
      buildCacheKey(userId, request),
    );
  });

  it('does not change for transport-only fields', () => {
    expect(buildCacheKey(userId, { ...request, stream: false, user: 'end-user-42' })).toBe(
      buildCacheKey(userId, request),
    );
  });

  it('is scoped to the user', () => {
    expect(buildCacheKey('64b7f0c2a1b2c3d4e5f60719', request)).not.toBe(
      buildCacheKey(userId, request),
    );
  });
});

describe('isCacheable', () => {
  it.each([
    [{ temperature: 0 }, {}, true],
    [{ temperature: 0.7 }, {}, false],
    [{}, {}, false],
    [{ temperature: 0.7 }, { force: true }, true],
    [{ temperature: 0, stream: true }, {}, false],
    [{ temperature: 0, stream: true }, { force: true }, false],
  ])('%j with %j -> %s', (req, options, expected) => {
    expect(isCacheable(req, options)).toBe(expected);
  });
});
