const { z } = require('zod');
const { objectId } = require('./common');
const { RANGES, isValidTimeZone } = require('../lib/timeBuckets');

const range = z.enum(Object.keys(RANGES)).default('24h');

const rangeQuery = z.object({ range }).strict();

const timeseriesQuery = z
  .object({
    range,
    metric: z.enum(['requests', 'cost', 'latency']).default('requests'),
    // IANA zone of the viewer, so day and hour buckets match their local clock.
    tz: z.string().max(64).default('UTC').refine(isValidTimeZone, 'Unknown time zone'),
  })
  .strict();

const booleanParam = z.enum(['true', 'false']).transform((value) => value === 'true');

const logsQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(['success', 'error', 'aborted']).optional(),
    model: z.string().min(1).max(128).optional(),
    apiKeyId: objectId.optional(),
    cached: booleanParam.optional(),
  })
  .strict();

module.exports = { rangeQuery, timeseriesQuery, logsQuery };
