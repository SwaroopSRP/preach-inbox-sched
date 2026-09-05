import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('Elasticsearch Projection & Search API', () => {
  const app = createApp();
  let userAId: string;
  let userBId: string;
  let senderAId: string;

  beforeAll(async () => {
    const userA = await prisma.user.create({
      data: {
        email: `search-a-${Date.now()}@reachinbox.test`,
        name: 'Search User A',
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        email: `search-b-${Date.now()}@reachinbox.test`,
        name: 'Search User B',
      },
    });
    userBId = userB.id;

    const senderA = await prisma.sender.create({
      data: {
        userId: userAId,
        email: `sender-a-${Date.now()}@reachinbox.test`,
        name: 'Sender A',
      },
    });
    senderAId = senderA.id;

    // Seed test emails for User A
    const e1 = await prisma.email.create({
      data: {
        userId: userAId,
        senderId: senderAId,
        recipient: 'john.doe@enterprise.com',
        subject: 'Quarterly Revenue Strategy 2026',
        body: 'Confidential strategic roadmap for Q3',
        status: 'SCHEDULED',
        scheduledAt: new Date(),
      },
    });

    const e2 = await prisma.email.create({
      data: {
        userId: userAId,
        senderId: senderAId,
        recipient: 'jane.smith@partner.org',
        subject: 'Partnership Onboarding',
        body: 'Welcome to the partner network roadmap',
        status: 'SENT',
        sentAt: new Date(),
        scheduledAt: new Date(),
      },
    });

    // Seed test email for User B with similar keyword to test user isolation
    const e3 = await prisma.email.create({
      data: {
        userId: userBId,
        senderId: senderAId, // arbitrary sender reference for test
        recipient: 'john.stranger@other.com',
        subject: 'Quarterly Revenue User B Private',
        body: 'Private information belonging exclusively to User B',
        status: 'SCHEDULED',
        scheduledAt: new Date(),
      },
    });

    // Ensure documents are indexed in Elasticsearch
    const { indexEmailDocument } = await import('../src/lib/elasticsearch.js');
    await Promise.all([
      indexEmailDocument({
        id: e1.id,
        userId: e1.userId,
        senderId: e1.senderId,
        recipient: e1.recipient,
        subject: e1.subject,
        body: e1.body,
        status: e1.status,
        scheduledAt: e1.scheduledAt.toISOString(),
      }),
      indexEmailDocument({
        id: e2.id,
        userId: e2.userId,
        senderId: e2.senderId,
        recipient: e2.recipient,
        subject: e2.subject,
        body: e2.body,
        status: e2.status,
        scheduledAt: e2.scheduledAt.toISOString(),
        sentAt: e2.sentAt?.toISOString(),
      }),
      indexEmailDocument({
        id: e3.id,
        userId: e3.userId,
        senderId: e3.senderId,
        recipient: e3.recipient,
        subject: e3.subject,
        body: e3.body,
        status: e3.status,
        scheduledAt: e3.scheduledAt.toISOString(),
      }),
    ]);
  });

  afterAll(async () => {
    await prisma.email.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.sender.deleteMany({ where: { userId: userAId } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  it('searches emails by recipient keyword with user isolation', async () => {
    const res = await request(app)
      .get('/api/emails/search?q=john.doe')
      .set('x-user-id', userAId);

    expect(res.status).toBe(200);
    expect(res.body.emails).toBeDefined();
    expect(res.body.count).toBe(1);
    expect(res.body.emails[0].recipient).toBe('john.doe@enterprise.com');
  });

  it('searches emails by subject/body keyword', async () => {
    const res = await request(app)
      .get('/api/emails/search?q=Revenue')
      .set('x-user-id', userAId);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.emails[0].subject).toContain('Revenue');

    // Confirms user isolation: User B's Revenue email is NOT returned
    const userBEmails = res.body.emails.filter((e: { userId: string }) => e.userId === userBId);
    expect(userBEmails).toHaveLength(0);
  });

  it('handles empty search query gracefully', async () => {
    const res = await request(app)
      .get('/api/emails/search?q=')
      .set('x-user-id', userAId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.emails)).toBe(true);
  });
});
