const { randomUUID } = require('node:crypto');
const { calculateCostUsd } = require('../../src/services/costService');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A small seeded PRNG (mulberry32), so the demo dataset is the same on every machine. */
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, weighted) {
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return weighted.at(-1).value;
}

/** Log-normal around a median: most values near it, a long tail of slow ones. */
function logNormal(random, median, spread) {
  const u = Math.max(random(), 1e-9);
  const v = random();
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(normal * spread);
}

/**
 * Traffic shape per model, derived from models.js rather than hard-coded names:
 * mock models use their configured latency; real models get slower as they get
 * pricier (a stand-in for size) and carry more of the traffic.
 */
function profileFor(model) {
  if (model.provider === 'mock') {
    return { weight: 1, medianLatencyMs: model.mock?.latencyMs ?? 200, spread: 0.25 };
  }
  return {
    weight: 3,
    medianLatencyMs: 1500 + model.pricing.outputPer1M * 1000,
    spread: 0.6,
  };
}

/** Busier during working hours and on weekdays, quiet at night. */
function trafficWeightAt(date) {
  const hour = date.getUTCHours();
  const day = date.getUTCDay();
  const daytime = hour >= 3 && hour <= 15 ? 1 : 0.35; // roughly 08:30–20:30 IST
  const weekday = day === 0 || day === 6 ? 0.55 : 1;
  return daytime * weekday;
}

function randomTimestamp(random, now, days) {
  // Rejection sampling against the traffic weight gives a believable daily rhythm.
  for (;;) {
    const date = new Date(now.getTime() - random() * days * DAY_MS);
    if (random() < trafficWeightAt(date)) return date;
  }
}

/**
 * Builds realistic RequestLog documents for the demo account: a mix of models and
 * keys, cache hits at temperature 0, streamed requests with time to first token,
 * fallbacks, a few failures, and one upstream incident two days ago.
 *
 * Every figure follows the same rules the gateway applies, so the dashboard's totals
 * are what the live system would have produced.
 */
function generateDemoTraffic({ userId, keys, models, now = new Date(), count = 500, seed = 42 }) {
  const random = createRandom(seed);
  const byId = new Map(models.map((model) => [model.id, model]));
  const modelChoices = models.map((model) => ({ value: model, weight: profileFor(model).weight }));
  const keyChoices = keys.map((key, index) => ({ value: key, weight: index === 0 ? 7 : 3 }));

  // The incident: a two-hour window where the busiest real model with a fallback
  // times out a third of the time and its fallback picks up the traffic.
  const incidentModel = models.find((m) => m.provider !== 'mock' && m.fallbacks.length > 0);
  const incidentEnd = new Date(now.getTime() - 2 * DAY_MS + 3 * HOUR_MS);
  const incidentStart = new Date(incidentEnd.getTime() - 2 * HOUR_MS);
  const inIncident = (date, model) =>
    model === incidentModel && date >= incidentStart && date < incidentEnd;

  const cachedAnswers = new Map(); // model id -> cost of the response being reused

  const logs = [];
  for (let i = 0; i < count; i += 1) {
    const createdAt =
      incidentModel && i < 24
        ? randomBetween(random, incidentStart, incidentEnd)
        : randomTimestamp(random, now, 7);
    const requested = incidentModel && i < 24 ? incidentModel : pick(random, modelChoices);
    const apiKey = pick(random, keyChoices);
    const stream = random() < 0.4;
    const temperatureZero = !stream && random() < 0.45;

    const base = {
      requestId: randomUUID(),
      userId,
      apiKeyId: apiKey._id,
      model: requested.id,
      stream,
      createdAt,
      cacheStatus: temperatureZero ? 'MISS' : 'BYPASS',
    };
    const promptTokens = Math.round(logNormal(random, 380, 0.7)) + 12;
    const completionTokens = Math.round(logNormal(random, 210, 0.6)) + 8;

    // Cache hits: a repeated temperature-0 prompt answered without a provider call.
    if (temperatureZero && cachedAnswers.has(requested.id) && random() < 0.55) {
      logs.push({
        ...base,
        servedModel: requested.id,
        provider: 'cache',
        promptTokens,
        completionTokens,
        costUsd: 0,
        savedUsd: calculateCostUsd(requested.pricing, { promptTokens, completionTokens }),
        latencyMs: Math.round(logNormal(random, 35, 0.4)),
        status: 'success',
        statusCode: 200,
        cached: true,
        cacheStatus: 'HIT',
        attempts: [],
      });
      continue;
    }

    const profile = profileFor(requested);
    const aborted = random() < 0.01;
    const primaryFails = inIncident(createdAt, requested)
      ? random() < 0.35
      : random() < (requested.mock?.failureRate ?? 0.03);
    const fallback = requested.fallbacks.length ? byId.get(requested.fallbacks[0]) : null;

    if (aborted) {
      const latencyMs = Math.round(
        logNormal(random, profile.medianLatencyMs, profile.spread) * 0.6,
      );
      const partial = Math.round(completionTokens * random() * 0.5);
      const usage = { promptTokens, completionTokens: partial };
      logs.push({
        ...base,
        servedModel: requested.id,
        provider: requested.provider,
        ...usage,
        tokensEstimated: true,
        costUsd: calculateCostUsd(requested.pricing, usage),
        latencyMs,
        ttftMs: stream ? Math.round(latencyMs * 0.3) : null,
        status: 'aborted',
        statusCode: 499,
        errorCode: 'client_closed_request',
        errorMessage: 'Client closed the request',
        attempts: [
          {
            model: requested.id,
            provider: requested.provider,
            outcome: 'error',
            errorCode: 'client_closed_request',
            latencyMs,
          },
        ],
      });
      continue;
    }

    if (primaryFails) {
      const timedOut = requested.provider !== 'mock' && random() < 0.6;
      const failure = timedOut
        ? { code: 'upstream_timeout', status: 504, latencyMs: requested.timeoutMs ?? 30_000 }
        : {
            code: 'upstream_error',
            status: 502,
            latencyMs: Math.round(logNormal(random, 400, 0.5)),
          };
      const failedAttempt = {
        model: requested.id,
        provider: requested.provider,
        outcome: 'error',
        errorCode: failure.code,
        latencyMs: failure.latencyMs,
      };

      if (!fallback || random() < 0.12) {
        logs.push({
          ...base,
          provider: requested.provider,
          latencyMs: failure.latencyMs,
          status: 'error',
          statusCode: failure.status,
          errorCode: failure.code,
          errorMessage: timedOut
            ? `${requested.provider} did not respond within ${failure.latencyMs}ms`
            : `${requested.provider} returned 503: overloaded`,
          attempts: [failedAttempt],
        });
        continue;
      }

      const fallbackProfile = profileFor(fallback);
      const fallbackLatency = Math.round(
        logNormal(random, fallbackProfile.medianLatencyMs, fallbackProfile.spread),
      );
      const usage = { promptTokens, completionTokens };
      const latencyMs = failure.latencyMs + fallbackLatency;
      logs.push({
        ...base,
        servedModel: fallback.id,
        provider: fallback.provider,
        ...usage,
        costUsd: calculateCostUsd(fallback.pricing, usage),
        latencyMs,
        ttftMs: stream ? failure.latencyMs + Math.round(fallbackLatency * 0.25) : null,
        status: 'success',
        statusCode: 200,
        fallbackUsed: true,
        attempts: [
          failedAttempt,
          {
            model: fallback.id,
            provider: fallback.provider,
            outcome: 'success',
            errorCode: null,
            latencyMs: fallbackLatency,
          },
        ],
      });
      continue;
    }

    const latencyMs = Math.round(logNormal(random, profile.medianLatencyMs, profile.spread));
    const usage = { promptTokens, completionTokens };
    const costUsd = calculateCostUsd(requested.pricing, usage);
    if (temperatureZero) cachedAnswers.set(requested.id, costUsd);
    logs.push({
      ...base,
      servedModel: requested.id,
      provider: requested.provider,
      ...usage,
      costUsd,
      latencyMs,
      ttftMs: stream ? Math.round(latencyMs * 0.25) : null,
      status: 'success',
      statusCode: 200,
      attempts: [
        {
          model: requested.id,
          provider: requested.provider,
          outcome: 'success',
          errorCode: null,
          latencyMs,
        },
      ],
    });
  }

  return logs.sort((a, b) => a.createdAt - b.createdAt);
}

function randomBetween(random, from, to) {
  return new Date(from.getTime() + random() * (to.getTime() - from.getTime()));
}

module.exports = { generateDemoTraffic, createRandom };
