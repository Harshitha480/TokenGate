const mongoose = require('mongoose');
const { generateDemoTraffic } = require('../../scripts/lib/demoTraffic');
const { createModelCatalog } = require('../../src/services/modelCatalog');
const { calculateCostUsd } = require('../../src/services/costService');
const { models } = require('../../src/config/models');

const catalog = createModelCatalog(models, { knownProviders: ['nvidia', 'mock'] });
const now = new Date('2026-10-22T12:00:00Z');
const keys = [{ _id: new mongoose.Types.ObjectId() }, { _id: new mongoose.Types.ObjectId() }];
const userId = new mongoose.Types.ObjectId();

const generate = (seed = 42) =>
  generateDemoTraffic({ userId, keys, models: catalog.list(), now, count: 500, seed });

describe('demo traffic generator', () => {
  const logs = generate();

  it('produces 500 requests inside the last 7 days, oldest first', () => {
    expect(logs).toHaveLength(500);
    const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    expect(logs.every((log) => log.createdAt >= weekAgo && log.createdAt <= now)).toBe(true);
    const times = logs.map((log) => log.createdAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('is deterministic for a given seed', () => {
    const strip = (rows) => rows.map(({ requestId, ...rest }) => rest);
    expect(strip(generate(7))).toEqual(strip(generate(7)));
  });

  it('charges each request at the price of the model that answered', () => {
    for (const log of logs.filter((row) => row.status === 'success' && !row.cached)) {
      const served = catalog.get(log.servedModel);
      expect(log.costUsd).toBe(
        calculateCostUsd(served.pricing, {
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
        }),
      );
    }
  });

  it('follows the gateway rules for cache hits, fallbacks and failures', () => {
    const hits = logs.filter((log) => log.cached);
    const fallbacks = logs.filter((log) => log.fallbackUsed);
    const failures = logs.filter((log) => log.status === 'error');

    expect(hits.length).toBeGreaterThan(20);
    expect(hits.every((log) => log.costUsd === 0 && log.savedUsd > 0 && !log.stream)).toBe(true);
    expect(fallbacks.length).toBeGreaterThan(5);
    expect(
      fallbacks.every(
        (log) =>
          log.attempts.length === 2 &&
          log.attempts[0].outcome === 'error' &&
          log.attempts[1].model === log.servedModel,
      ),
    ).toBe(true);
    expect(
      failures.every((log) => log.costUsd === undefined && log.servedModel === undefined),
    ).toBe(true);
    expect(failures.length / logs.length).toBeLessThan(0.1);
  });

  it('only uses models and keys that exist', () => {
    const modelIds = new Set(catalog.list().map((m) => m.id));
    const keyIds = new Set(keys.map((k) => k._id));
    expect(logs.every((log) => modelIds.has(log.model) && keyIds.has(log.apiKeyId))).toBe(true);
  });
});
