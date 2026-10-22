const pino = require('pino');
const { config } = require('../config/env');

// Anything that can carry a credential is redacted at the logger level, so a
// careless `logger.info({ req })` can never leak a key into log storage.
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.apiKey',
  '*.token',
];

const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'tokengate-server' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.env === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
  }),
});

module.exports = { logger };
