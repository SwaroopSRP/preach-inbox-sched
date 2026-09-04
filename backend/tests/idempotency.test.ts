import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { processEmailJob } from '../src/workers/email.worker.js';
import * as mailerService from '../src/integrations/mailer/mailer.service.js';
import * as rateLimiter from '../src/workers/rate-limiter.js';
import { Job } from 'bullmq';

describe('Idempotency & Duplicate Prevention Guard', () => {
  let testUserId: string;
  let testSenderId: string;

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'idempotency-test@reachinbox.test' },
      update: {},
      create: {
        email: 'idempotency-test@reachinbox.test',
        name: 'Idempotency Tester',
      },
    });
    testUserId = user.id;

    const sender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: testUserId,
          email: 'idempotent-sender@reachinbox.test',
        },
      },
      update: {},
      create: {
        userId: testUserId,
        email: 'idempotent-sender@reachinbox.test',
        name: 'Idempotent Sender',
      },
    });
    testSenderId = sender.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  it('guarantees only one worker can process an email when invoked concurrently', async () => {
    // Both concurrent invocations pass rate limiter so they test the database atomic lock
    vi.spyOn(rateLimiter, 'checkRateLimits').mockResolvedValue({ allowed: true });

    const sendMailSpy = vi.spyOn(mailerService, 'sendEmail').mockImplementation(async () => {
      // Simulate slight network delay
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        messageId: '<idempotency-check@ethereal.email>',
        previewUrl: 'https://ethereal.email/message/test',
      };
    });

    const email = await prisma.email.create({
      data: {
        userId: testUserId,
        senderId: testSenderId,
        recipient: 'concurrent@test.com',
        subject: 'Idempotency Race Test',
        body: 'Ensuring atomic conditional state transition',
        status: 'SCHEDULED',
        scheduledAt: new Date(),
      },
    });

    const mockJob = {
      id: email.id,
      data: { emailId: email.id },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job<{ emailId: string }>;

    // Fire two worker calls concurrently for the EXACT same email
    await Promise.all([processEmailJob(mockJob), processEmailJob(mockJob)]);

    // Crucial assertion: external SMTP delivery was only invoked EXACTLY ONCE
    expect(sendMailSpy).toHaveBeenCalledTimes(1);

    const updated = await prisma.email.findUnique({ where: { id: email.id } });
    expect(updated?.status).toBe('SENT');
  });

  it('skips processing if email is already in SENT status', async () => {
    const sendMailSpy = vi.spyOn(mailerService, 'sendEmail');
    sendMailSpy.mockClear();

    const email = await prisma.email.create({
      data: {
        userId: testUserId,
        senderId: testSenderId,
        recipient: 'already-sent@test.com',
        subject: 'Already Sent Test',
        body: 'Should not re-send',
        status: 'SENT',
        sentAt: new Date(),
        scheduledAt: new Date(),
      },
    });

    const mockJob = {
      id: email.id,
      data: { emailId: email.id },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job<{ emailId: string }>;

    await processEmailJob(mockJob);

    // No SMTP call should have been attempted
    expect(sendMailSpy).not.toHaveBeenCalled();
  });
});
