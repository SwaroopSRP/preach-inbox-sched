import { prisma } from '../../lib/prisma.js';
import { enqueueEmailJob } from '../../queue/email.queue.js';
import { ScheduleEmailInput } from './email.schema.js';
import { AppError } from '../../middleware/error.middleware.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export async function scheduleEmails(userId: string, input: ScheduleEmailInput) {
  // 1. Verify sender exists and belongs to user
  const sender = await prisma.sender.findFirst({
    where: { id: input.senderId, userId },
  });

  if (!sender) {
    throw new AppError(404, 'Sender not found or not owned by user');
  }

  // 2. Parse scheduled time & compute base delay
  const targetDate = new Date(input.scheduledAt);
  const now = Date.now();
  const baseDelayMs = Math.max(0, targetDate.getTime() - now);

  // Effective minimum inter-email delay bounded by system safety configuration
  const requestedDelay = input.delayMs !== undefined ? input.delayMs : env.MIN_EMAIL_DELAY_MS;
  const effectiveDelayMs = Math.max(requestedDelay, env.MIN_EMAIL_DELAY_MS);

  const createdEmails = [];

  // 3. Persist each recipient email record and enqueue in BullMQ
  for (let i = 0; i < input.recipients.length; i++) {
    const recipient = input.recipients[i];
    const jobDelay = baseDelayMs + i * effectiveDelayMs;
    const computedScheduledAt = new Date(now + jobDelay);

    const email = await prisma.email.create({
      data: {
        userId,
        senderId: sender.id,
        recipient,
        subject: input.subject,
        body: input.body,
        status: 'SCHEDULED',
        scheduledAt: computedScheduledAt,
      },
    });

    // Enqueue BullMQ delayed job with deterministic jobId = email.id
    await enqueueEmailJob(email.id, jobDelay);
    createdEmails.push(email);
  }

  logger.info(
    `Scheduled ${createdEmails.length} email(s) for user ${userId} via sender ${sender.email} starting with base delay ${baseDelayMs}ms`
  );

  return createdEmails;
}

export async function listScheduledEmails(userId: string) {
  return prisma.email.findMany({
    where: {
      userId,
      status: 'SCHEDULED',
    },
    include: {
      sender: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

export async function listSentEmails(userId: string) {
  return prisma.email.findMany({
    where: {
      userId,
      status: 'SENT',
    },
    include: {
      sender: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { sentAt: 'desc' },
  });
}

export async function getEmailById(emailId: string, userId: string) {
  const email = await prisma.email.findFirst({
    where: { id: emailId, userId },
    include: {
      sender: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!email) {
    throw new AppError(404, 'Email not found');
  }

  return email;
}
