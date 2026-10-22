const mongoose = require('mongoose');
const RequestLog = require('../models/RequestLog');
const { resolveRange, listBucketStarts } = require('../lib/timeBuckets');

const COST_PRECISION = 1e9;
const roundCost = (value) => Math.round((value ?? 0) * COST_PRECISION) / COST_PRECISION;
const roundMs = (value) => (value === null || value === undefined ? null : Math.round(value));
const ratio = (part, whole) => (whole > 0 ? part / whole : null);

// Aborted requests measure how long the client waited before leaving, not the
// gateway's speed, so they are left out of latency figures.
const LATENCY_UNLESS_ABORTED = { $cond: [{ $eq: ['$status', 'aborted'] }, null, '$latencyMs'] };
const countWhere = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

function scope(userId, from, to) {
  return {
    userId: new mongoose.Types.ObjectId(String(userId)),
    createdAt: { $gte: from, $lt: to },
  };
}

const SUMMARY_FIELDS = {
  requests: { $sum: 1 },
  costUsd: { $sum: '$costUsd' },
  savedUsd: { $sum: '$savedUsd' },
  promptTokens: { $sum: '$promptTokens' },
  completionTokens: { $sum: '$completionTokens' },
  cacheHits: countWhere({ $eq: ['$cacheStatus', 'HIT'] }),
  cacheMisses: countWhere({ $eq: ['$cacheStatus', 'MISS'] }),
  errors: countWhere({ $eq: ['$status', 'error'] }),
  fallbacks: countWhere('$fallbackUsed'),
  avgLatencyMs: { $avg: LATENCY_UNLESS_ABORTED },
  p95LatencyMs: {
    $percentile: { input: LATENCY_UNLESS_ABORTED, p: [0.95], method: 'approximate' },
  },
};

function toSummary(row) {
  const requests = row?.requests ?? 0;
  const cacheHits = row?.cacheHits ?? 0;
  const cacheLookups = cacheHits + (row?.cacheMisses ?? 0);
  return {
    requests,
    costUsd: roundCost(row?.costUsd),
    savedUsd: roundCost(row?.savedUsd),
    promptTokens: row?.promptTokens ?? 0,
    completionTokens: row?.completionTokens ?? 0,
    cacheHits,
    cacheHitRate: ratio(cacheHits, cacheLookups),
    errorCount: row?.errors ?? 0,
    errorRate: ratio(row?.errors ?? 0, requests),
    fallbackCount: row?.fallbacks ?? 0,
    avgLatencyMs: roundMs(row?.avgLatencyMs),
    p95LatencyMs: roundMs(row?.p95LatencyMs?.[0]),
  };
}

async function summarize(userId, from, to) {
  const [row] = await RequestLog.aggregate([
    { $match: scope(userId, from, to) },
    { $group: { _id: null, ...SUMMARY_FIELDS } },
  ]);
  return toSummary(row);
}

/** Headline numbers for a range, plus the same numbers for the period before it. */
async function getOverview(userId, { range, now = new Date() }) {
  const window = resolveRange(range, now);
  const [current, previous] = await Promise.all([
    summarize(userId, window.from, window.to),
    summarize(userId, window.previousFrom, window.from),
  ]);
  return { range, from: window.from, to: window.to, current, previous };
}

const TIMESERIES_FIELDS = {
  requests: {
    value: { $sum: 1 },
    errors: countWhere({ $eq: ['$status', 'error'] }),
  },
  cost: {
    value: { $sum: '$costUsd' },
    saved: { $sum: '$savedUsd' },
  },
  latency: {
    value: { $avg: LATENCY_UNLESS_ABORTED },
    p95: { $percentile: { input: LATENCY_UNLESS_ABORTED, p: [0.95], method: 'approximate' } },
  },
};

function toPoint(metric, start, row) {
  if (metric === 'requests') return { t: start, value: row?.value ?? 0, errors: row?.errors ?? 0 };
  if (metric === 'cost') {
    return { t: start, value: roundCost(row?.value), saved: roundCost(row?.saved) };
  }
  // A bucket with no traffic has no latency; null keeps the chart from drawing a fake 0ms.
  return { t: start, value: roundMs(row?.value), p95: roundMs(row?.p95?.[0]) };
}

/**
 * One point per time bucket across the range, buckets with no traffic included, so
 * charts show gaps and zeros honestly.
 */
async function getTimeseries(userId, { range, metric, timeZone, now = new Date() }) {
  const window = resolveRange(range, now);
  const bucket = { unit: window.unit, binSize: window.binSize, timeZone };

  const rows = await RequestLog.aggregate([
    { $match: scope(userId, window.from, window.to) },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: '$createdAt',
            unit: bucket.unit,
            binSize: bucket.binSize,
            timezone: timeZone,
          },
        },
        ...TIMESERIES_FIELDS[metric],
      },
    },
  ]);

  const byStart = new Map(rows.map((row) => [row._id.getTime(), row]));
  const points = listBucketStarts(window.from, window.to, bucket).map((start) =>
    toPoint(metric, start, byStart.get(start.getTime())),
  );

  return {
    range,
    metric,
    timeZone,
    bucket: { unit: bucket.unit, size: bucket.binSize },
    from: window.from,
    to: window.to,
    points,
  };
}

/** Requests and cost per model, attributing each request to the model that answered. */
async function getByModel(userId, { range, now = new Date() }) {
  const window = resolveRange(range, now);
  const rows = await RequestLog.aggregate([
    { $match: scope(userId, window.from, window.to) },
    {
      $group: {
        // Failed requests have no served model; count them against the requested one.
        _id: { $ifNull: ['$servedModel', '$model'] },
        ...SUMMARY_FIELDS,
      },
    },
    { $sort: { requests: -1, _id: 1 } },
  ]);
  return {
    range,
    data: rows.map((row) => ({ model: row._id, ...toSummary(row) })),
  };
}

module.exports = { getOverview, getTimeseries, getByModel };
