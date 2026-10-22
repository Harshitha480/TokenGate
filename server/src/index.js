const { config } = require('./config/env');
const { logger } = require('./lib/logger');
const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./db/mongoose');

const SHUTDOWN_GRACE_MS = 10_000;

async function start() {
  await connectDatabase(config.mongoUri);

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env }, 'TokenGate server listening');
  });

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    // If in-flight requests (long streams) outlive the grace period, exit anyway.
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    forceExit.unref();

    server.close(async (closeError) => {
      try {
        await disconnectDatabase();
        logger.info('Shutdown complete');
        process.exit(closeError ? 1 : 0);
      } catch (error) {
        logger.error({ err: error }, 'Error while closing the database connection');
        process.exit(1);
      }
    });
    // Idle keep-alive sockets would otherwise hold server.close() open.
    server.closeIdleConnections();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
