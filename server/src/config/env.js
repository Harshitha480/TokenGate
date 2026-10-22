const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

// Tests must never pick up real credentials or the real database from .env.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
}

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PROMPTS: booleanFromString,
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  DEFAULT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

/**
 * Parses and validates environment variables once at startup so a misconfigured
 * deployment fails fast with a readable message instead of at the first request.
 */
function loadConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const e = parsed.data;
  return Object.freeze({
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    mongoUri: e.MONGO_URI,
    jwt: Object.freeze({ secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN }),
    clientUrl: e.CLIENT_URL,
    logLevel: e.LOG_LEVEL,
    logPrompts: e.LOG_PROMPTS,
    bcryptRounds: e.BCRYPT_ROUNDS,
    defaultRateLimitPerMinute: e.DEFAULT_RATE_LIMIT_PER_MINUTE,
    providers: Object.freeze({
      // An empty key means "not configured": requests to it fail over instead of crashing.
      nvidia: Object.freeze({ apiKey: e.NVIDIA_API_KEY || null, baseUrl: e.NVIDIA_BASE_URL }),
    }),
    providerTimeoutMs: e.PROVIDER_TIMEOUT_MS,
  });
}

const config = loadConfig();

module.exports = { config, loadConfig };
