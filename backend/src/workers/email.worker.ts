import { Worker, Job } from 'bullmq';
import { EMAIL_QUEUE_NAME, EmailJobData } from '../queue/email.queue.js';
import { createRedisConnection } from '../lib/redis.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const workerRedisConnection = createRedisConnection('worker');

export function createEmailWorker(
  processor?: (job: Job<EmailJobData>) => Promise<void>
) {
  const defaultProcessor = async (job: Job<EmailJobData>) => {
    logger.info(`Processing email job ${job.id} for emailId: ${job.data.emailId}`);
  };

  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    processor ?? defaultProcessor,
    {
      connection: workerRedisConnection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  worker.on('active', (job) => {
    logger.info(`Email job ${job.id} is now active (attempt ${job.attemptsMade + 1})`);
  });

  worker.on('completed', (job) => {
    logger.info(`Email job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Email job ${job?.id} failed: ${err.message}`, {
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  return worker;
}

// Standalone execution entrypoint when run via `npm run worker`
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info(`Starting standalone Email Worker (concurrency: ${env.WORKER_CONCURRENCY})...`);
  const worker = createEmailWorker();

  const shutdown = async () => {
    logger.info('Shutting down Email Worker...');
    await worker.close();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
