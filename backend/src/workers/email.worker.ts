import { Worker, Job, DelayedError } from 'bullmq';
import { EMAIL_QUEUE_NAME, EmailJobData, emailQueue } from '../queue/email.queue.js';
import { createRedisConnection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { sendEmail } from '../integrations/mailer/mailer.service.js';
import { checkRateLimits } from './rate-limiter.js';
import { updateEmailDocument } from '../lib/elasticsearch.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const workerRedisConnection = createRedisConnection('worker');

// Optional hook for Slack notifications on rate-limit hit (wired in Phase 8)
export type RateLimitNotifyFn = (userId: string, senderEmail: string, maxHourly: number) => Promise<void>;
let rateLimitNotifier: RateLimitNotifyFn | null = null;

export function registerRateLimitNotifier(fn: RateLimitNotifyFn) {
  rateLimitNotifier = fn;
}

export async function processEmailJob(job: Job<EmailJobData>, token?: string) {
  const { emailId } = job.data;
  logger.info(`Worker picked up email job [${job.id}] for email ${emailId}`);

  // 1. Fetch email record from PostgreSQL (source of truth)
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!email) {
    logger.warn(`Email record ${emailId} not found in database. Skipping job.`);
    return;
  }

  // Idempotency guard: only proceed if status is SCHEDULED
  if (email.status !== 'SCHEDULED') {
    logger.warn(`Email ${emailId} is in status '${email.status}'. Skipping duplicate execution.`);
    return;
  }

  // 2. Check Hourly Rate Limit & Inter-Email Minimum Delay Throttling
  const limitCheck = await checkRateLimits(email.senderId);

  if (!limitCheck.allowed) {
    const delayMs = limitCheck.rescheduleDelayMs ?? 5000;

    if (limitCheck.reason === 'HOURLY_LIMIT_EXCEEDED') {
      logger.warn(
        `Sender ${email.sender.email} reached hourly limit. Rescheduling email ${emailId} for next window in ${Math.round(delayMs / 1000)}s`
      );

      // Update scheduledAt in DB to reflect the new window
      await prisma.email.update({
        where: { id: emailId },
        data: {
          scheduledAt: new Date(Date.now() + delayMs),
        },
      });

      // Trigger Slack notification if listener is registered
      if (rateLimitNotifier) {
        try {
          await rateLimitNotifier(email.userId, email.sender.email, env.MAX_EMAILS_PER_HOUR_PER_SENDER);
        } catch (err) {
          logger.error(`Failed to send rate-limit Slack notification: ${err instanceof Error ? err.message : err}`);
        }
      }
    } else {
      logger.info(
        `Spacing throttle enforced for sender ${email.sender.email}. Delaying email ${emailId} by ${delayMs}ms`
      );
    }

    // Move job back to delayed state in BullMQ if running inside active worker with token
    if (token && typeof job.moveToDelayed === 'function') {
      try {
        await job.moveToDelayed(Date.now() + delayMs, token);
        throw new DelayedError();
      } catch (err) {
        if (err instanceof DelayedError) {
          throw err;
        }
        logger.debug(`Could not moveToDelayed with token: ${err}`);
      }
    }

    return;
  }

  // 3. Atomic state transition: SCHEDULED -> PROCESSING
  const updateResult = await prisma.email.updateMany({
    where: {
      id: emailId,
      status: 'SCHEDULED',
    },
    data: {
      status: 'PROCESSING',
    },
  });

  if (updateResult.count === 0) {
    logger.warn(`Email ${emailId} concurrent transition lost. Skipping.`);
    return;
  }

  try {
    // 4. Send email via Nodemailer Ethereal SMTP
    const deliveryResult = await sendEmail({
      fromName: email.sender.name,
      fromEmail: email.sender.email,
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });

    // 5. Mark email as SENT
    const sentDate = new Date();
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: sentDate,
        errorMessage: null,
      },
    });

    // Update Elasticsearch projection
    updateEmailDocument(emailId, {
      status: 'SENT',
      sentAt: sentDate.toISOString(),
    }).catch(() => {});

    logger.info(`Email ${emailId} successfully sent to ${email.recipient}`, {
      messageId: deliveryResult.messageId,
      previewUrl: deliveryResult.previewUrl || undefined,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown SMTP delivery failure';
    logger.error(`Failed to send email ${emailId}: ${errorMsg}`);

    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
    if (isFinalAttempt) {
      const failedDate = new Date();
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
          failedAt: failedDate,
          errorMessage: errorMsg,
        },
      });

      updateEmailDocument(emailId, {
        status: 'FAILED',
      }).catch(() => {});
    }

    throw error;
  }
}

let activeWorkerInstance: Worker<EmailJobData> | null = null;

export function getActiveWorker(): Worker<EmailJobData> | null {
  return activeWorkerInstance;
}

export function createEmailWorker(
  processor?: (job: Job<EmailJobData>, token?: string) => Promise<void>
) {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    processor ?? processEmailJob,
    {
      connection: workerRedisConnection,
      concurrency: env.WORKER_CONCURRENCY,
    }
  );

  activeWorkerInstance = worker;

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
