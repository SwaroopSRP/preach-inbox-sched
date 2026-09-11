import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { redis } from '../src/lib/redis.js';
import { prisma } from '../src/lib/prisma.js';
import {
  checkRateLimits,
  getHourlyWindowKey,
  getMillisUntilNextHour,
} from '../src/workers/rate-limiter.js';
import { processEmailJob } from '../src/workers/email.worker.js';
import * as mailerService from '../src/integrations/mailer/mailer.service.js';
import { Job } from 'bullmq';

describe('Rate Limiting & Throttling Engine', () => {
  let testUserId: string;
  let testSenderId: string;
  const testSenderEmail = 'limited-sender@preachinbox.test';

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'rate-limit-test@preachinbox.test' },
      update: {},
      create: {
        email: 'rate-limit-test@preachinbox.test',
        name: 'Rate Limit Tester',
      },
    });
    testUserId = user.id;

    const sender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: testUserId,
          email: testSenderEmail,
        },
      },
      update: {},
      create: {
        userId: testUserId,
        email: testSenderEmail,
        name: 'Rate Limited Sender',
      },
    });
    testSenderId = sender.id;
  });

  afterAll(async () => {
    // Clean up test keys in Redis
    const windowKey = getHourlyWindowKey(testSenderId);
    await redis.del(windowKey);
    await redis.del(`email-delay:${testSenderId}`);
  });

  it('correctly calculates milliseconds until the next hour window', () => {
    const ms = getMillisUntilNextHour();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(3600000);
  });

  it('enforces hourly limits and blocks excess sends for a sender', async () => {
    const customSenderId = 'sender-custom-' + Date.now();
    const maxHourly = 2;
    const minDelay = 0; // Test hourly limit in isolation

    // 1st email: allowed
    const r1 = await checkRateLimits(customSenderId, minDelay, maxHourly);
    expect(r1.allowed).toBe(true);
    expect(r1.currentCount).toBe(1);

    // 2nd email: allowed
    const r2 = await checkRateLimits(customSenderId, minDelay, maxHourly);
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);

    // 3rd email: blocked with HOURLY_LIMIT_EXCEEDED
    const r3 = await checkRateLimits(customSenderId, minDelay, maxHourly);
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toBe('HOURLY_LIMIT_EXCEEDED');
    expect(r3.rescheduleDelayMs).toBeGreaterThan(0);
  });

  it('reschedules a job instead of dropping or failing it when rate-limited', async () => {
    vi.spyOn(mailerService, 'sendEmail').mockResolvedValue({
      messageId: '<test@ethereal>',
    });

    // Fill up the sender limit
    const windowKey = getHourlyWindowKey(testSenderId);
    await redis.set(windowKey, '999999'); // Exceed limit

    const email = await prisma.email.create({
      data: {
        userId: testUserId,
        senderId: testSenderId,
        recipient: 'rescheduled@test.com',
        subject: 'Rate Limit Reschedule Test',
        body: 'Should be rescheduled to next hour',
        status: 'SCHEDULED',
        scheduledAt: new Date(),
      },
    });

    const moveToDelayedSpy = vi.fn().mockResolvedValue(undefined);
    const mockJob = {
      id: email.id,
      name: 'send-email',
      data: { emailId: email.id },
      opts: { attempts: 3 },
      attemptsMade: 0,
      moveToDelayed: moveToDelayedSpy,
    } as unknown as Job<{ emailId: string }>;

    try {
      await processEmailJob(mockJob, 'mock-token');
    } catch (err) {
      // BullMQ expects DelayedError when moving a job to delayed
      if (!(err instanceof Error && err.name === 'DelayedError')) {
        throw err;
      }
    }

    // Verification:
    // 1. Job was NOT sent
    // 2. Job was NOT marked FAILED
    // 3. Email record remains in SCHEDULED status with updated future scheduledAt
    const updatedEmail = await prisma.email.findUnique({ where: { id: email.id } });
    expect(updatedEmail?.status).toBe('SCHEDULED');
    expect(updatedEmail?.scheduledAt.getTime()).toBeGreaterThan(Date.now());

    // 4. Job was moved to delayed state in BullMQ with the calculated window delay
    expect(moveToDelayedSpy).toHaveBeenCalledTimes(1);
    expect(moveToDelayedSpy.mock.calls[0][0]).toBeGreaterThan(Date.now());
  });
});
