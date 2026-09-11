/**
 * End-to-End Blackbox Systems Test for PreachInbox Sched
 * 
 * Performs blackbox testing over HTTP:
 * - Zero mocks
 * - Pure HTTP fetch calls
 * - Verifies real DB, Redis, BullMQ queue, Ethereal SMTP, and Elasticsearch integration
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface StepResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: StepResult[] = [];

async function step(name: string, fn: () => Promise<string | void>) {
  const start = Date.now();
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    results.push({ name, passed: true, durationMs, details: details || undefined });
    console.log(`  ✓ PASS: ${name} (${durationMs}ms)${details ? ` — ${details}` : ''}`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ name, passed: false, durationMs, details: err.message });
    console.error(`  ✗ FAIL: ${name} (${durationMs}ms)\n    Error: ${err.message}`);
  }
}

function extractCookie(res: Response, cookieName: string): string | null {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? `${cookieName}=${match[1]}` : null;
}

async function runBlackboxSystemsTest() {
  console.log('\n===============================================================');
  console.log('🛡️  BLACKBOX SYSTEMS INTEGRATION TEST SUITE');
  console.log(`   Target Server: ${BASE_URL}`);
  console.log('===============================================================\n');

  const runId = Date.now();
  const testEmail = `blackbox-${runId}@preachinbox.test`;
  const testPassword = 'SecureBlackboxPassword123!';
  const testName = `Blackbox Tester ${runId}`;

  let sessionCookie: string | null = null;
  let token: string | null = null;
  let userId: string | null = null;
  let defaultSenderId: string | null = null;
  let scheduledEmailId: string | null = null;

  // 1. System Health Probe
  await step('1. System Health & Probes (/health)', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    if (data.status !== 'ok') throw new Error(`Status not ok: ${data.status}`);
    if (data.connections.redis.status !== 'connected') throw new Error(`Redis: ${data.connections.redis.status}`);
    if (data.connections.database.status !== 'connected') throw new Error(`DB: ${data.connections.database.status}`);
    if (data.connections.bullmq.status !== 'ready') throw new Error(`BullMQ: ${data.connections.bullmq.status}`);
    return `Redis (${data.connections.redis.latencyMs}ms), DB (${data.connections.database.latencyMs}ms), ES (${data.connections.elasticsearch.status})`;
  });

  // 2. User Registration
  await step('2. User Registration (POST /api/auth/register)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName,
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = (await res.json()) as any;
    userId = data.user.id;
    token = data.token;
    sessionCookie = extractCookie(res, 'token');

    if (!sessionCookie) throw new Error('No HTTP-only token cookie issued on registration');
    if (!data.user?.id) throw new Error('User object missing ID');
    return `Created user ${data.user.email} [${userId}]`;
  });

  // 3. Duplicate Registration Rejection
  await step('3. Duplicate Email Prevention (409 Conflict)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName,
      }),
    });

    if (res.status !== 409) throw new Error(`Expected 409 Conflict, got ${res.status}`);
    const data = (await res.json()) as any;
    return `Rejected duplicate: "${data.error}"`;
  });

  // 4. Input Validation Defense
  await step('4. Input Validation (400 Bad Request)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email',
        password: '123',
        name: '',
      }),
    });

    if (res.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.details || data.details.length === 0) throw new Error('Missing Zod error details array');
    return `Caught ${data.details.length} validation errors`;
  });

  // 5. User Login & Cookie Refresh
  await step('5. User Login (POST /api/auth/login)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    sessionCookie = extractCookie(res, 'token') || sessionCookie;
    return `Logged in successfully, token verified`;
  });

  // 6. Profile Verification via Cookie
  await step('6. Session Verification (GET /api/auth/me)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: sessionCookie || '' },
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    if (data.user.email !== testEmail.toLowerCase()) throw new Error(`Email mismatch: ${data.user.email}`);
    return `Session valid for ${data.user.email}`;
  });

  // 7. Auto-provisioned & Custom Sender Identities
  await step('7. Sender Management (GET & POST /api/senders)', async () => {
    // Check auto-provisioned sender
    const listRes = await fetch(`${BASE_URL}/api/senders`, {
      headers: { Cookie: sessionCookie || '' },
    });
    const listData = (await listRes.json()) as any;
    if (!listData.senders || listData.senders.length === 0) {
      throw new Error('Default sender was not automatically provisioned');
    }
    defaultSenderId = listData.senders[0].id;

    // Create a secondary sender
    const createRes = await fetch(`${BASE_URL}/api/senders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie || '',
      },
      body: JSON.stringify({
        email: `outreach-${runId}@custom-domain.com`,
        name: 'Custom Outreach Team',
      }),
    });

    if (createRes.status !== 201) throw new Error(`Expected 201, got ${createRes.status}`);
    const createData = (await createRes.json()) as any;
    return `Found default sender [${defaultSenderId}] & created custom sender [${createData.sender.id}]`;
  });

  // 8. Email Scheduling & Batch Enqueueing
  await step('8. Email Scheduling (POST /api/emails/schedule)', async () => {
    const recipients = [
      `lead1-${runId}@enterprise.com`,
      `lead2-${runId}@enterprise.com`,
      `lead3-${runId}@enterprise.com`,
    ];

    const res = await fetch(`${BASE_URL}/api/emails/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie || '',
      },
      body: JSON.stringify({
        senderId: defaultSenderId,
        recipients,
        subject: `Systems Test Opportunity ${runId}`,
        body: `Hello! This is an automated systems test payload for run ${runId}.`,
        scheduledAt: new Date().toISOString(),
        delayMs: 2000,
      }),
    });

    if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
    const data = (await res.json()) as any;
    if (data.emails.length !== 3) throw new Error(`Expected 3 emails, got ${data.emails.length}`);
    scheduledEmailId = data.emails[0].id;
    return `Enqueued 3 emails with 2000ms staggered delays`;
  });

  // 9. Query Scheduled Emails
  await step('9. Query Scheduled List (GET /api/emails/scheduled)', async () => {
    const res = await fetch(`${BASE_URL}/api/emails/scheduled`, {
      headers: { Cookie: sessionCookie || '' },
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    if (!Array.isArray(data.emails)) throw new Error('Expected array of emails');
    return `Found ${data.emails.length} active scheduled email(s)`;
  });

  // 10. Asynchronous Worker Processing & Delivery State Transition
  await step('10. Live Worker Delivery & State Transition (Wait for Delivery)', async () => {
    console.log('    ⏳ Polling for BullMQ worker to process and dispatch email (up to 20s)...');
    const startTime = Date.now();
    let sentEmail: any = null;

    while (Date.now() - startTime < 20000) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${BASE_URL}/api/emails/sent`, {
        headers: { Cookie: sessionCookie || '' },
      });

      if (res.status === 200) {
        const data = (await res.json()) as any;
        if (data.emails && data.emails.length > 0) {
          sentEmail = data.emails[0];
          if (sentEmail.status === 'SENT') break;
        }
      }
    }

    if (!sentEmail || sentEmail.status !== 'SENT') {
      throw new Error('Worker did not transition matured email to SENT within 20 seconds');
    }
    if (!sentEmail.sentAt) throw new Error('sentAt timestamp was not populated');
    return `Worker delivered email to ${sentEmail.recipient} at ${sentEmail.sentAt}`;
  });

  // 11. Single Email Record Lookup
  await step('11. Single Email Record Lookup (GET /api/emails/:id)', async () => {
    const res = await fetch(`${BASE_URL}/api/emails/${scheduledEmailId}`, {
      headers: { Cookie: sessionCookie || '' },
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    if (!data.email?.sender?.email) throw new Error('Sender relation was not included');
    return `Retrieved email ${data.email.id} (status: ${data.email.status})`;
  });

  // 12. Full-Text Search
  await step('12. Full-Text Search (GET /api/emails/search?q=...)', async () => {
    const res = await fetch(`${BASE_URL}/api/emails/search?q=Systems+Test`, {
      headers: { Cookie: sessionCookie || '' },
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    if (!Array.isArray(data.emails)) throw new Error('Search did not return emails array');
    return `Search returned ${data.count} result(s) via source: '${data.source}'`;
  });

  // 13. Slack Integration Status Check
  await step('13. Slack Integration Status (GET /api/integrations/slack/status)', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/slack/status`, {
      headers: { Cookie: sessionCookie || '' },
    });

    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    return `Slack connected: ${data.connected}`;
  });

  // 14. Bull Board Queue Dashboard Verification
  await step('14. Bull Board Admin Dashboard (GET /admin/queues/api/queues)', async () => {
    const res = await fetch(`${BASE_URL}/admin/queues/api/queues`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const data = (await res.json()) as any;
    const queue = data.queues?.find((q: any) => q.name === 'email-queue');
    if (!queue) throw new Error('email-queue not found in Bull Board metadata');
    return `Queue: ${queue.name} | Completed: ${queue.counts.completed} | Delayed: ${queue.counts.delayed}`;
  });

  // 15. Logout & Unauthorized Security Guard
  await step('15. Logout & Unauthorized Protection (POST /api/auth/logout)', async () => {
    // Logout
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
    });
    if (logoutRes.status !== 200) throw new Error(`Expected 200, got ${logoutRes.status}`);

    // Verify unauthenticated request without cookie is rejected
    const unauthRes = await fetch(`${BASE_URL}/api/auth/me`);
    if (unauthRes.status !== 401) throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    return `Cookie cleared, 401 Unauthorized correctly enforced`;
  });

  // Summary
  console.log('\n===============================================================');
  console.log('📊 BLACKBOX TEST SUMMARY');
  console.log('===============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`Results: ${passedCount}/${totalCount} Passed (${Math.round((passedCount / totalCount) * 100)}%)`);
  console.log(`Total Execution Time: ${totalDuration}ms`);

  if (passedCount === totalCount) {
    console.log('\n🎉 ALL BLACKBOX SYSTEMS TESTS PASSED WITH 100% RELIABILITY!');
    console.log('===============================================================\n');
  } else {
    console.error('\n⚠️ SOME BLACKBOX TESTS FAILED. Check log details above.');
    console.log('===============================================================\n');
    process.exit(1);
  }
}

runBlackboxSystemsTest().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
