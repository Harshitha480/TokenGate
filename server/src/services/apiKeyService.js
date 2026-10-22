const ApiKey = require('../models/ApiKey');
const { config } = require('../config/env');
const { generateApiKey, hashApiKey, looksLikeApiKey } = require('../lib/apiKeyCrypto');
const { AppError, notFound, conflict } = require('../lib/errors');

const MAX_ACTIVE_KEYS_PER_USER = 25;
// Writing lastUsedAt on every request would turn each gateway call into a DB write.
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

function effectiveRateLimit(apiKey) {
  return apiKey.rateLimitPerMinute ?? config.defaultRateLimitPerMinute;
}

function toPublicKey(apiKey) {
  return {
    id: apiKey.id,
    name: apiKey.name,
    maskedKey: `${apiKey.prefix}…${apiKey.lastFour}`,
    rateLimitPerMinute: effectiveRateLimit(apiKey),
    hasCustomRateLimit: apiKey.rateLimitPerMinute !== null,
    status: apiKey.revokedAt ? 'revoked' : 'active',
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt,
  };
}

async function createKey(userId, { name, rateLimitPerMinute = null }) {
  const activeCount = await ApiKey.countDocuments({ userId, revokedAt: null });
  if (activeCount >= MAX_ACTIVE_KEYS_PER_USER) {
    throw conflict(`You can have at most ${MAX_ACTIVE_KEYS_PER_USER} active keys`);
  }

  const { plaintextKey, keyHash, prefix, lastFour } = generateApiKey();
  const apiKey = await ApiKey.create({
    userId,
    name,
    keyHash,
    prefix,
    lastFour,
    rateLimitPerMinute,
  });
  return { apiKey, plaintextKey };
}

function listKeys(userId) {
  return ApiKey.find({ userId }).sort({ revokedAt: 1, createdAt: -1 });
}

async function getOwnedKey(userId, keyId) {
  const apiKey = await ApiKey.findOne({ _id: keyId, userId });
  if (!apiKey) throw notFound('API key not found');
  return apiKey;
}

async function updateKey(userId, keyId, changes) {
  const apiKey = await getOwnedKey(userId, keyId);
  if (apiKey.revokedAt) {
    throw new AppError(409, 'key_revoked', 'Revoked keys cannot be changed');
  }
  if (changes.name !== undefined) apiKey.name = changes.name;
  if (changes.rateLimitPerMinute !== undefined) {
    apiKey.rateLimitPerMinute = changes.rateLimitPerMinute;
  }
  return apiKey.save();
}

async function revokeKey(userId, keyId) {
  const apiKey = await getOwnedKey(userId, keyId);
  if (!apiKey.revokedAt) {
    apiKey.revokedAt = new Date();
    await apiKey.save();
  }
  return apiKey;
}

/**
 * Resolves a plaintext gateway key to its record. `apiKey` is null for anything that
 * is not a live key, so callers cannot accidentally treat a revoked key as valid;
 * `reason` says why, for the error message.
 */
async function authenticateKey(plaintextKey) {
  if (!looksLikeApiKey(plaintextKey)) return { apiKey: null, reason: 'invalid' };

  const apiKey = await ApiKey.findOne({ keyHash: hashApiKey(plaintextKey) });
  if (!apiKey) return { apiKey: null, reason: 'invalid' };
  if (apiKey.revokedAt) return { apiKey: null, reason: 'revoked' };
  return { apiKey, reason: null };
}

async function recordKeyUsage(apiKey, now = new Date()) {
  const lastUsed = apiKey.lastUsedAt?.getTime() ?? 0;
  if (now.getTime() - lastUsed < LAST_USED_WRITE_INTERVAL_MS) return;
  apiKey.lastUsedAt = now;
  await ApiKey.updateOne({ _id: apiKey._id }, { $set: { lastUsedAt: now } });
}

module.exports = {
  createKey,
  listKeys,
  getOwnedKey,
  updateKey,
  revokeKey,
  authenticateKey,
  recordKeyUsage,
  effectiveRateLimit,
  toPublicKey,
};
