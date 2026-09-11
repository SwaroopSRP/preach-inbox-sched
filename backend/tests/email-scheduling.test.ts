import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { emailQueue } from '../src/queue/email.queue.js';

describe('Email Scheduling & Query APIs', () => {
  const app = createApp();
  let testUserId: string;
  let testSenderId: string;

  beforeAll(async () => {
    // Ensure test user exists
    const user = await prisma.user.upsert({
      where: { email: 'sched-test@preachinbox.test' },
      update: {},
      create: {
        email: 'sched-test@preachinbox.test',
        name: 'Schedule Tester',
      },
    });
    testUserId = user.id;

    // Create a test sender
    const sender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: testUserId,
          email: 'sender@preachinbox.test',
        },
      },
      update: {},
      create: {
        userId: testUserId,
        email: 'sender@preachinbox.test',
        name: 'Official Sender',
      },
    });
    testSenderId = sender.id;
  });

  afterAll(async () => {
    await emailQueue.close();
  });

  it('rejects scheduling request with invalid payload (Zod validation)', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .set('x-user-id', testUserId)
      .send({
        senderId: 'not-a-uuid',
        subject: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('successfully schedules single and batch emails with deterministic BullMQ jobs', async () => {
    const scheduledAt = new Date(Date.now() + 10000).toISOString();

    const res = await request(app)
      .post('/api/emails/schedule')
      .set('x-user-id', testUserId)
      .send({
        senderId: testSenderId,
        subject: 'Welcome to PreachInbox',
        body: 'Hello from the scheduling engine',
        recipients: ['alpha@example.com', 'beta@example.com'],
        scheduledAt,
        delayMs: 2500,
      });

    expect(res.status).toBe(201);
    expect(res.body.emails).toHaveLength(2);

    const email1 = res.body.emails[0];
    const email2 = res.body.emails[1];

    expect(email1.status).toBe('SCHEDULED');
    expect(email1.recipient).toBe('alpha@example.com');
    expect(email2.status).toBe('SCHEDULED');
    expect(email2.recipient).toBe('beta@example.com');

    // Verify BullMQ jobs were added with deterministic IDs matching the Email IDs
    const job1 = await emailQueue.getJob(email1.id);
    const job2 = await emailQueue.getJob(email2.id);

    expect(job1).toBeDefined();
    expect(job1?.id).toBe(email1.id);
    expect(job2).toBeDefined();
    expect(job2?.id).toBe(email2.id);
  });

  it('retrieves scheduled emails via GET /api/emails/scheduled', async () => {
    const res = await request(app)
      .get('/api/emails/scheduled')
      .set('x-user-id', testUserId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.emails)).toBe(true);
    expect(res.body.emails.length).toBeGreaterThanOrEqual(2);
    expect(res.body.emails[0].status).toBe('SCHEDULED');
  });
});
