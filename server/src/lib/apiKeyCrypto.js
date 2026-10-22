const { createHash, randomBytes } = require('node:crypto');

const KEY_PREFIX = 'tg_live_';
const KEY_PATTERN = /^tg_live_[A-Za-z0-9_-]{32}$/;
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 4;

/**
 * Keys carry 192 bits of randomness, so a fast SHA-256 digest is as safe as a slow
 * password hash here, and it lets every gateway request find its key with a
 * single indexed lookup instead of comparing against each stored hash.
 */
function hashApiKey(plaintextKey) {
  return createHash('sha256').update(plaintextKey).digest('hex');
}

function generateApiKey() {
  const plaintextKey = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return {
    plaintextKey,
    keyHash: hashApiKey(plaintextKey),
    prefix: plaintextKey.slice(0, DISPLAY_PREFIX_LENGTH),
    lastFour: plaintextKey.slice(-4),
  };
}

function looksLikeApiKey(value) {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

module.exports = { generateApiKey, hashApiKey, looksLikeApiKey, KEY_PREFIX };
