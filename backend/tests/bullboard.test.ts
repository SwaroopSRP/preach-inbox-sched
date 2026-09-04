import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Bull Board Queue Dashboard', () => {
  const app = createApp();

  it('mounts Bull Board dashboard at /admin/queues and returns UI/redirect', async () => {
    const res = await request(app).get('/admin/queues');
    // Bull Board responds with 200 (HTML) or 302 (redirect to trailing slash)
    expect([200, 302]).toContain(res.status);
    if (res.status === 302) {
      expect(res.headers.location).toContain('/admin/queues/');
    }
  });

  it('serves Bull Board API queues metadata endpoint', async () => {
    const res = await request(app).get('/admin/queues/api/queues');
    expect(res.status).toBe(200);
    expect(res.body.queues).toBeDefined();
    expect(Array.isArray(res.body.queues)).toBe(true);

    const emailQueueMeta = res.body.queues.find(
      (q: { name: string }) => q.name === 'email-queue'
    );
    expect(emailQueueMeta).toBeDefined();
    expect(emailQueueMeta.name).toBe('email-queue');
  });
});
