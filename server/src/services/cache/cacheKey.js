const { createHash } = require('node:crypto');

// Every request field that can change what the model generates. Transport fields
// (stream, stream_options) and the opaque `user` tag are deliberately left out.
const OUTPUT_AFFECTING_FIELDS = [
  'model',
  'messages',
  'temperature',
  'max_tokens',
  'top_p',
  'stop',
  'presence_penalty',
  'frequency_penalty',
  'seed',
  'reasoning_effort',
  'chat_template_kwargs',
];

/** JSON with object keys sorted at every level, so key order never changes the hash. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * SHA-256 over the user and the output-affecting request fields. Scoping by user
 * keeps one tenant's responses (and the savings from them) out of another's cache.
 */
function buildCacheKey(userId, request) {
  const material = { userId: String(userId) };
  for (const field of OUTPUT_AFFECTING_FIELDS) {
    if (request[field] !== undefined) material[field] = request[field];
  }
  return createHash('sha256').update(canonicalJson(material)).digest('hex');
}

/**
 * Exact-match caching only makes sense when the same input should give the same
 * output: temperature 0, or the client explicitly asking for it. Streams are never
 * cached.
 */
function isCacheable(request, { force = false } = {}) {
  if (request.stream) return false;
  return force || request.temperature === 0;
}

module.exports = { buildCacheKey, isCacheable, canonicalJson };
