import { prisma } from '../../lib/prisma.js';
import { enqueueEmailJob } from '../../queue/email.queue.js';
import { ScheduleEmailInput } from './email.schema.js';
import { AppError } from '../../middleware/error.middleware.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { indexEmailDocument, searchEmails as esSearch } from '../../lib/elasticsearch.js';

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

  // 3. Persist each recipient email record, enqueue in BullMQ, and index in Elasticsearch projection
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

    // Asynchronously project into Elasticsearch (non-blocking, failure-tolerant)
    indexEmailDocument({
      id: email.id,
      userId: email.userId,
      senderId: email.senderId,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      status: email.status,
      scheduledAt: email.scheduledAt.toISOString(),
      sentAt: null,
    }).catch(() => {});

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

export async function searchEmails(userId: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      source: 'empty',
      count: 0,
      emails: [],
    };
  }

  // 1. Relational search with case-insensitive partial substring match across recipient, subject, body, sender
  const pgEmails = await prisma.email.findMany({
    where: {
      userId,
      OR: [
        { recipient: { contains: trimmed, mode: 'insensitive' } },
        { subject: { contains: trimmed, mode: 'insensitive' } },
        { body: { contains: trimmed, mode: 'insensitive' } },
        { sender: { name: { contains: trimmed, mode: 'insensitive' } } },
        { sender: { email: { contains: trimmed, mode: 'insensitive' } } },
      ],
    },
    include: {
      sender: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  // 2. Also query Elasticsearch if available for fuzzy/indexed matching
  try {
    const esHits = await esSearch(userId, trimmed);
    const emailMap = new Map(pgEmails.map((e) => [e.id, e]));

    for (const hit of esHits) {
      if (!emailMap.has(hit.id)) {
        const fullEmail = await prisma.email.findUnique({
          where: { id: hit.id },
          include: {
            sender: {
              select: { id: true, email: true, name: true },
            },
          },
        });
        if (fullEmail) {
          emailMap.set(fullEmail.id, fullEmail);
        }
      }
    }

    const combined = Array.from(emailMap.values());
    return {
      source: 'elasticsearch_and_postgres',
      count: combined.length,
      emails: combined,
    };
  } catch (err) {
    logger.warn('Falling back strictly to PostgreSQL relational search');
    return {
      source: 'postgres_fallback',
      count: pgEmails.length,
      emails: pgEmails,
    };
  }
}

