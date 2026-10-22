const { z } = require('zod');

const modelSchema = z
  .object({
    displayName: z.string().min(1),
    provider: z.string().min(1),
    upstreamModel: z.string().min(1),
    pricing: z.object({
      inputPer1M: z.number().nonnegative(),
      outputPer1M: z.number().nonnegative(),
    }),
    timeoutMs: z.number().int().positive().optional(),
    defaultParams: z.record(z.string(), z.unknown()).default({}),
    fallbacks: z.array(z.string()).default([]),
    mock: z
      .object({
        latencyMs: z.number().int().nonnegative(),
        failureRate: z.number().min(0).max(1),
        failStatus: z.number().int().min(400).max(599).optional(),
      })
      .optional(),
  })
  .strict();

/**
 * Wraps the models config with validation and lookups. Validation runs at startup,
 * so a typo in a fallback id or a missing price fails the deploy, not a request.
 *
 * @param {Record<string, object>} models
 * @param {{ knownProviders: string[] }} options
 */
function createModelCatalog(models, { knownProviders }) {
  const entries = new Map();

  for (const [id, rawModel] of Object.entries(models)) {
    const parsed = modelSchema.safeParse(rawModel);
    if (!parsed.success) {
      throw new Error(`Invalid model config "${id}": ${parsed.error.issues[0].message}`);
    }
    if (!knownProviders.includes(parsed.data.provider)) {
      throw new Error(`Model "${id}" uses unknown provider "${parsed.data.provider}"`);
    }
    entries.set(id, Object.freeze({ id, ...parsed.data }));
  }

  for (const model of entries.values()) {
    for (const fallbackId of model.fallbacks) {
      if (!entries.has(fallbackId)) {
        throw new Error(`Model "${model.id}" falls back to unknown model "${fallbackId}"`);
      }
      if (fallbackId === model.id) {
        throw new Error(`Model "${model.id}" lists itself as a fallback`);
      }
    }
  }

  return {
    get: (id) => entries.get(id) ?? null,
    has: (id) => entries.has(id),
    list: () => [...entries.values()],
    /** The requested model followed by its fallbacks, in the order they are tried. */
    routeFor(id) {
      const primary = entries.get(id);
      if (!primary) return [];
      return [primary, ...primary.fallbacks.map((fallbackId) => entries.get(fallbackId))];
    },
  };
}

module.exports = { createModelCatalog };
