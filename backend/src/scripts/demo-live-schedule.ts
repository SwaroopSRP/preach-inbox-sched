/**
 * Live Demonstration Script for PreachInbox Sched
 * 
 * Runs an automated demo by:
 * 1. Authenticating as a demo user
 * 2. Creating / fetching a sender identity
 * 3. Scheduling a batch of 5 emails with staggered delay timers:
 *    - Job 1: immediate (T+0s)
 *    - Job 2: T+2s
 *    - Job 3: T+6s
 *    - Job 4: T+15s (watch it in Bull Board Delayed tab!)
 *    - Job 5: T+25s (watch it in Bull Board Delayed tab!)
 * 4. Prints instructions for opening the live Bull Board dashboard
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function runDemo() {
  console.log('\n===============================================================');
  console.log('🚀 PREACHINBOX SCHED — LIVE DEMONSTRATION');
  console.log('===============================================================\n');

  // 1. Authenticate via Dev-Login or Register
  console.log('Step 1: Authenticating test session...');
  const authRes = await fetch(`${API_URL}/api/auth/dev-login?format=json&email=demo.user@reachinbox.test&name=Demo%20User`);
  const authData = (await authRes.json()) as any;
  const token = authData.token;
  const user = authData.user;
  console.log(`✓ Authenticated as: ${user.name} (${user.email}) [ID: ${user.id}]\n`);

  // 2. Fetch User's Senders
  console.log('Step 2: Retrieving sender identity...');
  const sendersRes = await fetch(`${API_URL}/api/senders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sendersData = (await sendersRes.json()) as any;
  let sender = sendersData.senders?.[0];

  if (!sender) {
    console.log('Creating default sender identity...');
    const createSenderRes = await fetch(`${API_URL}/api/senders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        name: user.name,
      }),
    });
    sender = ((await createSenderRes.json()) as any).sender;
  }
  console.log(`✓ Using Sender: "${sender.name}" <${sender.email}> [ID: ${sender.id}]\n`);

  // 3. Schedule 5 emails with staggered delays
  console.log('Step 3: Scheduling 5 emails into BullMQ delayed queue...');
  const recipients = [
    'lead.immediate@acme-corp.com',
    'lead.plus2s@acme-corp.com',
    'lead.plus6s@acme-corp.com',
    'lead.plus15s@acme-corp.com',
    'lead.plus25s@acme-corp.com',
  ];

  const now = Date.now();
  const schedulePayload = {
    senderId: sender.id,
    recipients,
    subject: 'Exclusive Outreach Demo',
    body: 'Hi there!\n\nThis email was dispatched via PreachInbox Sched BullMQ engine.',
    scheduledAt: new Date(now).toISOString(),
    delayMs: 3000, // 3s minimum spacing between jobs
  };

  const scheduleRes = await fetch(`${API_URL}/api/emails/schedule`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(schedulePayload),
  });

  const scheduleData = (await scheduleRes.json()) as any;
  console.log(`✓ ${scheduleData.message}`);
  console.log('  Job details enqueued:');
  for (let i = 0; i < scheduleData.emails.length; i++) {
    const em = scheduleData.emails[i];
    console.log(`    [Job ${i + 1}] Target: ${em.recipient} | ScheduledAt: ${em.scheduledAt}`);
  }

  console.log('\n===============================================================');
  console.log('🎯 LIVE BULL BOARD DASHBOARD ACCESS');
  console.log('===============================================================');
  console.log('👉 Open in your browser: http://localhost:3000/admin/queues');
  console.log('   - Click on "email-queue"');
  console.log('   - Click the "Delayed" tab to see upcoming jobs with live timers!');
  console.log('   - Watch them transition automatically to "Active" -> "Completed"');
  console.log('   - Click any completed job to inspect the payload, lock & timing.');
  console.log('===============================================================\n');
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
