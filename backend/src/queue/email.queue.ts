import { Queue, JobsOptions } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export const EMAIL_QUEUE_NAME = 'email-queue';

export interface EmailJobData {
  emailId: string;
}

const queueRedisConnection = createRedisConnection('queue');

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: queueRedisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 5000,
    },
  },
});

export async function enqueueEmailJob(
  emailId: string,
  delayMs: number,
  options?: Partial<JobsOptions>
) {
  const safeDelay = Math.max(0, Math.floor(delayMs));

  // Deterministic jobId = emailId ensures application-level duplicate prevention in BullMQ
  const job = await emailQueue.add(
    'send-email',
    { emailId },
    {
      jobId: emailId,
      delay: safeDelay,
      ...options,
    }
  );

  logger.info(`Enqueued BullMQ job [${job.id}] for email ${emailId} with delay ${safeDelay}ms`);
  return job;
}
