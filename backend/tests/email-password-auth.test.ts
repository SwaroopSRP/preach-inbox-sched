import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('Email & Password Authentication', () => {
  const app = createApp();
  const testEmail = `user-${Date.now()}@auth-test.com`;
  const testPassword = 'Password123!';
  const testName = 'Alice Wonderland';

  it('successfully registers a new user with email and password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        name: testName,
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Registration successful');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
    expect(res.body.user.name).toBe(testName);
    expect(res.body.token).toBeDefined();

    // Verify HTTP-only cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('token=');
    expect(cookies[0]).toContain('HttpOnly');

    // Verify DB user record has hashed password (not plaintext)
    const dbUser = await prisma.user.findUnique({ where: { email: testEmail.toLowerCase() } });
    expect(dbUser).not.toBeNull();
    expect(dbUser?.password).not.toBeNull();
    expect(dbUser?.password).not.toBe(testPassword);
    expect(dbUser?.password?.startsWith('$2')).toBe(true); // bcrypt hash prefix

    // Verify auto-created sender identity
    const dbSender = await prisma.sender.findFirst({ where: { userId: dbUser?.id } });
    expect(dbSender).not.toBeNull();
    expect(dbSender?.email).toBe(testEmail.toLowerCase());
    expect(dbSender?.name).toBe(testName);
  });

  it('rejects registration with duplicate email (409 Conflict)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: testEmail,
        password: 'AnotherPassword123!',
        name: 'Imposter',
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('rejects registration with invalid inputs (400 Bad Request)', async () => {
    // Short password
    const res1 = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'shortpass@example.com',
        password: '123',
        name: 'Shorty',
      });

    expect(res1.status).toBe(400);
    expect(res1.body.details).toBeDefined();

    // Invalid email format
    const res2 = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'not-an-email',
        password: 'validpassword123',
        name: 'Valid Name',
      });

    expect(res2.status).toBe(400);
    expect(res2.body.details).toBeDefined();
  });

  it('successfully logs in with valid email and password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login successful');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
    expect(res.body.token).toBeDefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('token=');
  });

  it('rejects login with incorrect password (401 Unauthorized)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('rejects login with non-existent email (401 Unauthorized)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nobody@nowhere.test',
        password: 'somepassword',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('rejects password login for accounts created exclusively via Google OAuth', async () => {
    // Create a Google user with null password
    const googleUser = await prisma.user.create({
      data: {
        email: `google-only-${Date.now()}@gmail.com`,
        name: 'Google Only User',
        googleId: `gid-${Date.now()}`,
        password: null,
      },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: googleUser.email,
        password: 'AttemptPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Google OAuth');
  });

  it('authenticates subsequent requests via session cookie from login', async () => {
    // 1. Log in to obtain cookie
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      });

    expect(loginRes.status).toBe(200);
    const authCookie = loginRes.headers['set-cookie'];

    // 2. Call GET /api/auth/me using the cookie
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', authCookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(testEmail.toLowerCase());

    // 3. Call GET /api/senders using the cookie
    const sendersRes = await request(app)
      .get('/api/senders')
      .set('Cookie', authCookie);

    expect(sendersRes.status).toBe(200);
    expect(sendersRes.body.senders.length).toBeGreaterThanOrEqual(1);
    expect(sendersRes.body.senders[0].email).toBe(testEmail.toLowerCase());
  });
});
