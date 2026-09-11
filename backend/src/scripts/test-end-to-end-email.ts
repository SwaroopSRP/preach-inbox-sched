import { prisma } from '../lib/prisma.js';
import { scheduleEmails } from '../modules/emails/email.service.js';
import { createEmailWorker } from '../workers/email.worker.js';
import { emailQueue } from '../queue/email.queue.js';

async function main() {
  console.log('--- Step 1: Setting up Test User & Sender ---');
  const user = await prisma.user.upsert({
    where: { email: 'ethereal-demo@preachinbox.test' },
    update: {},
    create: {
      email: 'ethereal-demo@preachinbox.test',
      name: 'Ethereal Demo User',
    },
  });

  const sender = await prisma.sender.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: 'sales@preachinbox.test',
      },
    },
    update: {},
    create: {
      userId: user.id,
      email: 'sales@preachinbox.test',
      name: 'PreachInbox Sales Team',
    },
  });

  console.log(`User: ${user.email} (${user.id})`);
  console.log(`Sender: ${sender.email} (${sender.id})`);

  console.log('\n--- Step 2: Scheduling Email with BullMQ (2 second delay) ---');
  const [scheduledEmail] = await scheduleEmails(user.id, {
    senderId: sender.id,
    recipients: ['prospective-client@acme-corp.com'],
    subject: 'PreachInbox Automated Outreach - Demo Verification',
    body: 'Hello!\n\nThis is a verified delivery test sent through the BullMQ delayed queue to Ethereal Email.\n\nBest regards,\nPreachInbox Team',
    scheduledAt: new Date(Date.now() + 2000).toISOString(),
    delayMs: 2000,
  });

  console.log(`Scheduled Email ID: ${scheduledEmail.id}`);
  console.log(`Current DB Status: ${scheduledEmail.status}`);

  console.log('\n--- Step 3: Starting BullMQ Worker to Process the Job ---');
  const worker = createEmailWorker();

  console.log('Waiting for BullMQ delay to mature and email to send (approx 4-5s)...');
  
  // Poll DB for status change to SENT
  let attempts = 0;
  while (attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    attempts++;
    const current = await prisma.email.findUnique({ where: { id: scheduledEmail.id } });
    if (current && current.status === 'SENT') {
      console.log('\n=== VERIFICATION SUCCESSFUL! ===');
      console.log(`Email ID: ${current.id}`);
      console.log(`Database Status: ${current.status}`);
      console.log(`Sent At: ${current.sentAt?.toISOString()}`);
      console.log('Delivered via: Ethereal SMTP');
      await worker.close();
      await emailQueue.close();
      process.exit(0);
    }
  }

  console.error('Timed out waiting for email to send');
  await worker.close();
  await emailQueue.close();
  process.exit(1);
}

main().catch((err) => {
  console.error('Error in test:', err);
  process.exit(1);
});
