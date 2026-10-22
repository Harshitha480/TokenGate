const { Redis } = require('@upstash/redis');

/** Upstash talks HTTPS, so there is no connection pool to open or close. */
function createUpstashClient({ url, token }) {
  // Values are JSON strings we parse ourselves, so we always know what comes back.
  return new Redis({ url, token, automaticDeserialization: false });
}

module.exports = { createUpstashClient };
