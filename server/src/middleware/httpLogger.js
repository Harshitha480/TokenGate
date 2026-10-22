const pinoHttp = require('pino-http');
const { logger } = require('../lib/logger');

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  // Health probes run every few seconds and would drown out real traffic.
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { httpLogger };
