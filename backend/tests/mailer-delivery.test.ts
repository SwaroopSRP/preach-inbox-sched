import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { processEmailJob } from '../src/workers/email.worker.js';
import * as mailerService from '../src/integrations/mailer/mailer.service.js';
import * as rateLimiter from '../src/workers/rate-limiter.js';
import { Job } from 'bullmq';

describe('Email Delivery & Worker State Machine', () => {
  let testUserId: string;
  let testSenderId: string;

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'delivery-test@reachinbox.test' },
      update: {},
      create: {
        email: 'delivery-test@reachinbox.test',
        name: 'Delivery Tester',
      },
    });
    testUserId = user.id;

    const sender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: testUserId,
          email: 'outbox@reachinbox.test',
        },
      },
      update: {},
      create: {
        userId: testUserId,
        email: 'outbox@reachinbox.test',
        name: 'Outbox Sender',
      },
    });
    testSenderId = sender.id;
  });

  beforeEach(() => {
    vi.spyOn(rateLimiter, 'checkRateLimits').mockResolvedValue({ allowed: true });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  it('transitions email from SCHEDULED to SENT on successful delivery', async () => {
    // Spy on sendEmail to simulate quick reliable delivery without waiting for internet roundtrip
    const sendMailSpy = vi.spyOn(mailerService, 'sendEmail').mockResolvedValueOnce({
      messageId: '<test-message-id-123@ethereal.email>',
      previewUrl: 'https://ethereal.email/message/test-preview-123',
    });

    const email = await prisma.email.create({
      data: {
        userId: testUserId,
        senderId: testSenderId,
        recipient: 'recipient@test.com',
        subject: 'Delivery Test',
        body: 'Testing state transitions',
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

    await processEmailJob(mockJob);

    expect(sendMailSpy).toHaveBeenCalledTimes(1);

    const updated = await prisma.email.findUnique({ where: { id: email.id } });
    expect(updated?.status).toBe('SENT');
    expect(updated?.sentAt).not.toBeNull();
  });

  it('marks email as FAILED on final attempt failure', async () => {
    vi.spyOn(mailerService, 'sendEmail').mockRejectedValueOnce(
      new Error('SMTP Connection Refused')
    );

    const email = await prisma.email.create({
      data: {
        userId: testUserId,
        senderId: testSenderId,
        recipient: 'fail@test.com',
        subject: 'Failure Test',
        body: 'Testing failure handling',
        status: 'SCHEDULED',
        scheduledAt: new Date(),
      },
    });

    const mockJob = {
      id: email.id,
      data: { emailId: email.id },
      opts: { attempts: 3 },
      attemptsMade: 2, // Final attempt
    } as unknown as Job<{ emailId: string }>;

    await expect(processEmailJob(mockJob)).rejects.toThrow('SMTP Connection Refused');

    const updated = await prisma.email.findUnique({ where: { id: email.id } });
    expect(updated?.status).toBe('FAILED');
    expect(updated?.failedAt).not.toBeNull();
    expect(updated?.errorMessage).toContain('SMTP Connection Refused');
  });
});
