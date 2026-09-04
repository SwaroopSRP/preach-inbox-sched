import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import * as slackService from '../src/modules/slack/slack.service.js';

describe('Slack OAuth & Rate-Limit Notifications', () => {
  const app = createApp();
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: 'slack-test@reachinbox.test' },
      update: {},
      create: {
        email: 'slack-test@reachinbox.test',
        name: 'Slack Integration Tester',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.slackConnection.deleteMany({ where: { userId: testUserId } });
  });

  it('returns connected: false when no Slack connection exists', async () => {
    const res = await request(app)
      .get('/api/integrations/slack/status')
      .set('x-user-id', testUserId);

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(false);
  });

  it('connects Slack and persists connection state via callback', async () => {
    // Simulate OAuth callback with test code (triggers dev mock exchange)
    const res = await request(app)
      .get(`/api/integrations/slack/callback?code=test-auth-code&state=${testUserId}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('slack=connected');

    // Verify DB record exists
    const statusRes = await request(app)
      .get('/api/integrations/slack/status')
      .set('x-user-id', testUserId);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.connected).toBe(true);
    expect(statusRes.body.teamName).toBe('PreachInbox Dev Team');
  });

  it('deduplicates Slack notifications within the same hour window', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as unknown as Response);

    // Force real token format for test
    await prisma.slackConnection.update({
      where: { userId: testUserId },
      data: { accessToken: 'xoxb-real-format-token' },
    });

    const senderEmail = `spammer-${Date.now()}@test.com`;

    // 1st notification in window: dispatches message
    await slackService.notifySlackOnRateLimit(testUserId, senderEmail, 200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 2nd notification in the same window: deduplicated by Redis key
    await slackService.notifySlackOnRateLimit(testUserId, senderEmail, 200);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1! No spam!
  });

  it('disconnects Slack cleanly via POST /api/integrations/slack/disconnect', async () => {
    const res = await request(app)
      .post('/api/integrations/slack/disconnect')
      .set('x-user-id', testUserId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const statusRes = await request(app)
      .get('/api/integrations/slack/status')
      .set('x-user-id', testUserId);

    expect(statusRes.body.connected).toBe(false);
  });
});
