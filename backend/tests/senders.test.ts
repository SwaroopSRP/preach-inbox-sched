import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateJwtToken } from '../src/modules/auth/auth.service.js';

describe('Sender Identity & Ethereal Provisioning APIs', () => {
  const app = createApp();

  it('provisions an Ethereal sandbox sender and lists it', async () => {
    const user = await prisma.user.create({
      data: {
        email: `ethereal-test-${Date.now()}@example.com`,
        name: 'Ethereal Tester',
      },
    });
    const token = generateJwtToken(user);

    // 1. Create ethereal test sender
    const createRes = await request(app)
      .post('/api/senders/ethereal')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sandbox Outbox' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.sender).toBeDefined();
    expect(createRes.body.sender.name).toBe('Sandbox Outbox');
    expect(createRes.body.sender.email).toContain('@ethereal.email');

    const createdSenderId = createRes.body.sender.id;

    // 2. List senders
    const listRes = await request(app)
      .get('/api/senders')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.senders).toBeDefined();
    const found = listRes.body.senders.some((s: { id: string }) => s.id === createdSenderId);
    expect(found).toBe(true);

    // 3. Delete sender
    const deleteRes = await request(app)
      .delete(`/api/senders/${createdSenderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // 4. Verify sender is gone
    const listAfterDelete = await request(app)
      .get('/api/senders')
      .set('Authorization', `Bearer ${token}`);

    const stillExists = listAfterDelete.body.senders.some((s: { id: string }) => s.id === createdSenderId);
    expect(stillExists).toBe(false);
  });
});
