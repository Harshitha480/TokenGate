const { createModelCatalog } = require('../../src/services/modelCatalog');
const { models: configuredModels } = require('../../src/config/models');

const knownProviders = ['nvidia', 'mock'];

const baseModel = {
  displayName: 'Test',
  provider: 'mock',
  upstreamModel: 'test',
  pricing: { inputPer1M: 1, outputPer1M: 2 },
};

describe('createModelCatalog', () => {
  it('accepts the shipped models.js', () => {
    const catalog = createModelCatalog(configuredModels, { knownProviders });

    expect(catalog.list().length).toBe(Object.keys(configuredModels).length);
    expect(catalog.get('nemotron-3-ultra').upstreamModel).toBe('nvidia/nemotron-3-ultra-550b-a55b');
  });

  it('routes to the requested model first, then its fallbacks in order', () => {
    const catalog = createModelCatalog(
      {
        primary: { ...baseModel, fallbacks: ['second', 'third'] },
        second: baseModel,
        third: baseModel,
      },
      { knownProviders },
    );

    expect(catalog.routeFor('primary').map((m) => m.id)).toEqual(['primary', 'second', 'third']);
    expect(catalog.routeFor('second').map((m) => m.id)).toEqual(['second']);
    expect(catalog.routeFor('missing')).toEqual([]);
  });

  it.each([
    ['an unknown fallback', { a: { ...baseModel, fallbacks: ['ghost'] } }, /unknown model "ghost"/],
    ['a self fallback', { a: { ...baseModel, fallbacks: ['a'] } }, /lists itself/],
    ['an unknown provider', { a: { ...baseModel, provider: 'acme' } }, /unknown provider "acme"/],
    [
      'a negative price',
      { a: { ...baseModel, pricing: { inputPer1M: -1, outputPer1M: 0 } } },
      /Invalid model config "a"/,
    ],
    ['an unexpected field', { a: { ...baseModel, priceTypo: 3 } }, /Invalid model config "a"/],
  ])('rejects %s at startup', (_label, models, message) => {
    expect(() => createModelCatalog(models, { knownProviders })).toThrow(message);
  });
});
