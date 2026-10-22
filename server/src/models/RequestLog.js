const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// One entry per provider call made while serving a request, in order. A request
// that fell back has several; a cache hit has none.
const attemptSchema = new mongoose.Schema(
  {
    model: { type: String, required: true },
    provider: { type: String, required: true },
    outcome: { type: String, enum: ['success', 'error'], required: true },
    errorCode: { type: String, default: null },
    latencyMs: { type: Number, required: true },
    simulated: { type: Boolean, default: false },
  },
  { _id: false },
);

const requestLogSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  userId: { type: ObjectId, ref: 'User', required: true },
  apiKeyId: { type: ObjectId, ref: 'ApiKey', required: true },

  model: { type: String, required: true }, // what the client asked for
  servedModel: { type: String, default: null }, // what actually answered (differs after fallback)
  provider: { type: String, default: null }, // provider of servedModel, or the last one tried
  stream: { type: Boolean, default: false },

  promptTokens: { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
  tokensEstimated: { type: Boolean, default: false },
  costUsd: { type: Number, default: 0 },
  savedUsd: { type: Number, default: 0 }, // what a cache hit would have cost

  latencyMs: { type: Number, required: true },
  ttftMs: { type: Number, default: null }, // time to first token, streams only

  status: { type: String, enum: ['success', 'error', 'aborted'], required: true },
  statusCode: { type: Number, required: true },
  errorCode: { type: String, default: null },
  errorMessage: { type: String, default: null },

  cached: { type: Boolean, default: false },
  // HIT or MISS when the request was eligible for the cache, BYPASS otherwise; the
  // hit rate is HIT / (HIT + MISS), so uncacheable traffic does not dilute it.
  cacheStatus: { type: String, enum: ['HIT', 'MISS', 'BYPASS'], default: 'BYPASS' },
  fallbackUsed: { type: Boolean, default: false },
  attempts: { type: [attemptSchema], default: [] },

  // Only stored when LOG_PROMPTS=true.
  prompt: { type: String },
  completion: { type: String },

  // Set explicitly rather than via `timestamps` so the seed script can backdate rows.
  createdAt: { type: Date, default: Date.now },
});

// Dashboard queries always scope to one user (or one key) and a time range.
requestLogSchema.index({ apiKeyId: 1, createdAt: -1 });
requestLogSchema.index({ userId: 1, createdAt: -1 });
// Lookups by the X-Request-Id a client saw (the Playground, support questions).
requestLogSchema.index({ requestId: 1 });

module.exports = mongoose.models.RequestLog ?? mongoose.model('RequestLog', requestLogSchema);
