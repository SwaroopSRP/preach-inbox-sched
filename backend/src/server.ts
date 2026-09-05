import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createEmailWorker } from './workers/email.worker.js';

const app = createApp();

// Start BullMQ email worker directly inside the web service.
// This guarantees delayed jobs are automatically processed in production without
// needing a separate paid background worker instance on Render.
const emailWorker = createEmailWorker();
logger.info(`BullMQ Email Worker running embedded with concurrency ${env.WORKER_CONCURRENCY}`);

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

const shutdown = async () => {
  logger.info('Gracefully shutting down HTTP server and BullMQ worker...');
  try {
    await emailWorker.close();
  } catch (err) {
    logger.error(`Error closing email worker during shutdown: ${err instanceof Error ? err.message : err}`);
  }
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
