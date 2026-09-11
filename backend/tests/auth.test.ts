import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { generateJwtToken } from '../src/modules/auth/auth.service.js';

describe('Google Authentication & Session Management', () => {
  const app = createApp();

  it('redirects to Google OAuth authorization endpoint on /api/auth/google', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('completes OAuth callback, provisions user, sets token cookie, and creates default sender', async () => {
    const res = await request(app)
      .get('/api/auth/google/callback?code=mock-test-code')
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.token).toBeDefined();

    // Check HTTP-only cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('token=');
    expect(cookies[0]).toContain('HttpOnly');

    // Verify user and auto-created sender exist in DB
    const dbUser = await prisma.user.findUnique({ where: { id: res.body.user.id } });
    expect(dbUser).not.toBeNull();

    const dbSender = await prisma.sender.findFirst({ where: { userId: dbUser?.id } });
    expect(dbSender).not.toBeNull();
    expect(dbSender?.email).toBe(dbUser?.email);
  });

  it('retrieves authenticated profile via GET /api/auth/me using JWT token', async () => {
    const testUser = await prisma.user.create({
      data: {
        email: `jwt-${Date.now()}@preachinbox.test`,
        name: 'JWT Tester',
      },
    });

    const token = generateJwtToken(testUser);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(testUser.id);
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('clears token cookie on POST /api/auth/logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('token=;');
  });
});
