const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('./config/env');
const { createContainer } = require('./container');
const { requestId } = require('./middleware/requestId');
const { httpLogger } = require('./middleware/httpLogger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/healthRoutes');
const { createAuthRouter } = require('./routes/authRoutes');
const keyRoutes = require('./routes/keyRoutes');
const { createGatewayRouter } = require('./routes/gatewayRoutes');
const { createPlaygroundRouter } = require('./routes/playgroundRoutes');
const {
  createStatsRouter,
  createLogsRouter,
  createModelsRouter,
} = require('./routes/dashboardRoutes');
const { createGatewayController } = require('./controllers/gatewayController');

// Browsers hide response headers from scripts unless CORS lists them; the dashboard
// Playground reads these to show which provider answered and how fast.
const EXPOSED_HEADERS = [
  'X-Request-Id',
  'X-TokenGate-Provider',
  'X-TokenGate-Model',
  'X-TokenGate-Latency-Ms',
  'X-TokenGate-Fallback',
  'X-TokenGate-Cache',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Retry-After',
];

function createApp(container = createContainer()) {
  const app = express();
  const gatewayController = createGatewayController(container);

  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.clientUrl, exposedHeaders: EXPOSED_HEADERS }));
  app.use(requestId);
  app.use(httpLogger);
  app.use(express.json({ limit: '1mb' }));

  app.use('/health', healthRoutes);
  app.use('/api/auth', createAuthRouter(container));
  app.use('/api/keys', keyRoutes);
  app.use('/api/stats', createStatsRouter());
  app.use('/api/logs', createLogsRouter());
  app.use('/api/models', createModelsRouter(container));
  app.use('/api/playground', createPlaygroundRouter({ gatewayController, ...container }));
  app.use('/v1', createGatewayRouter({ gatewayController, ...container }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
