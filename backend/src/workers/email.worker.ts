import { Worker, Job } from 'bullmq';
import { EMAIL_QUEUE_NAME, EmailJobData } from '../queue/email.queue.js';
import { createRedisConnection } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { sendEmail } from '../integrations/mailer/mailer.service.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const workerRedisConnection = createRedisConnection('worker');

export async function processEmailJob(job: Job<EmailJobData>) {
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

  // 2. Atomic state transition: only proceed if status is SCHEDULED
  // If already SENT or PROCESSING, skip to guarantee idempotency
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
    logger.warn(`Email ${emailId} is already in state '${email.status}'. Idempotency guard skipped execution.`);
    return;
  }

  try {
    // 3. Send email via Nodemailer Ethereal SMTP
    const deliveryResult = await sendEmail({
      fromName: email.sender.name,
      fromEmail: email.sender.email,
      to: email.recipient,
      subject: email.subject,
      body: email.body,
    });

    // 4. Mark email as SENT
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        errorMessage: null,
      },
    });

    logger.info(`Email ${emailId} successfully sent to ${email.recipient}`, {
      messageId: deliveryResult.messageId,
      previewUrl: deliveryResult.previewUrl || undefined,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown SMTP delivery failure';
    logger.error(`Failed to send email ${emailId}: ${errorMsg}`);

    // Mark as FAILED if this is the final attempt or non-retryable
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
    if (isFinalAttempt) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage: errorMsg,
        },
      });
    }

    throw error;
  }
}

export function createEmailWorker(
  processor?: (job: Job<EmailJobData>) => Promise<void>
) {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    processor ?? processEmailJob,
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
