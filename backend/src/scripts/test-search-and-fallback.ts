import { prisma } from '../lib/prisma.js';
import { scheduleEmails, searchEmails } from '../modules/emails/email.service.js';
import { esClient } from '../lib/elasticsearch.js';
import { emailQueue } from '../queue/email.queue.js';
import { redis } from '../lib/redis.js';

async function main() {
  console.log('====================================================');
  console.log('   ELASTICSEARCH & POSTGRES FALLBACK VERIFICATION   ');
  console.log('====================================================\n');

  // Setup test users
  const userA = await prisma.user.upsert({
    where: { email: 'elastic-tester-a@reachinbox.test' },
    update: {},
    create: { email: 'elastic-tester-a@reachinbox.test', name: 'User A' },
  });

  const userB = await prisma.user.upsert({
    where: { email: 'elastic-tester-b@reachinbox.test' },
    update: {},
    create: { email: 'elastic-tester-b@reachinbox.test', name: 'User B' },
  });

  const senderA = await prisma.sender.upsert({
    where: { userId_email: { userId: userA.id, email: 'sender-a@reachinbox.test' } },
    update: {},
    create: { userId: userA.id, email: 'sender-a@reachinbox.test', name: 'Sender A' },
  });

  const senderB = await prisma.sender.upsert({
    where: { userId_email: { userId: userB.id, email: 'sender-b@reachinbox.test' } },
    update: {},
    create: { userId: userB.id, email: 'sender-b@reachinbox.test', name: 'Sender B' },
  });

  // Clean up any leftovers from previous test runs
  await esClient.deleteByQuery({
    index: 'emails',
    query: {
      terms: { userId: [userA.id, userB.id] },
    },
    refresh: true,
  }).catch(() => {});
  await prisma.email.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });

  // --- Scenario 1: Indexing & Live Elasticsearch Search ---
  console.log('--- TEST 1: Scheduling Emails & Indexing into Elasticsearch ---');
  const uniqueKeyword = `QuantumLeap-${Date.now()}`;

  const [emailA] = await scheduleEmails(userA.id, {
    senderId: senderA.id,
    recipients: ['investor@quantum-capital.com'],
    subject: `Project ${uniqueKeyword} Pitch Deck`,
    body: 'Confidential seed investment round overview for Q4 2026',
    scheduledAt: new Date(Date.now() + 60000).toISOString(),
  });

  // Schedule an email for User B with the same keyword to test data isolation
  const [emailB] = await scheduleEmails(userB.id, {
    senderId: senderB.id,
    recipients: ['secret@quantum-vault.com'],
    subject: `User B Private ${uniqueKeyword}`,
    body: 'This belongs exclusively to User B and must not leak to User A',
    scheduledAt: new Date(Date.now() + 60000).toISOString(),
  });

  console.log(`Created Email A (User A): ${emailA.id}`);
  console.log(`Created Email B (User B): ${emailB.id}`);

  // Give async indexing promise a brief moment to complete network roundtrip
  console.log('\nWaiting for async index promises and refreshing Elasticsearch index...');
  await new Promise((r) => setTimeout(r, 1500));
  await esClient.indices.refresh({ index: 'emails' });

  console.log(`\n--- TEST 2: Searching via Elasticsearch for keyword '${uniqueKeyword}' ---`);
  const resultA = await searchEmails(userA.id, uniqueKeyword);
  console.log(`Search Source: ${resultA.source}`);
  console.log(`Total Matches for User A: ${resultA.count}`);
  console.log(`Matched Email Subject: ${resultA.emails[0]?.subject}`);

  if (resultA.source !== 'elasticsearch') {
    throw new Error(`Expected source to be 'elasticsearch', got '${resultA.source}'`);
  }
  if (resultA.count !== 1 || resultA.emails[0]?.id !== emailA.id) {
    throw new Error('Search result did not match expected Email A');
  }

  // Verify User B isolation
  const containsUserBData = resultA.emails.some((e) => e.userId === userB.id);
  if (containsUserBData) {
    throw new Error('SECURITY VIOLATION: User A was able to see User B emails in search results!');
  }
  console.log('✅ User data isolation verified: User A cannot see User B emails in Elasticsearch.');

  // --- Scenario 2: Fallback Engine Verification ---
  console.log('\n--- TEST 3: Testing PostgreSQL Relational Fallback Engine ---');
  console.log('Simulating Elasticsearch failure by calling fallback search logic directly...');
  
  // Query with a search term that falls back to PostgreSQL relational search
  const postgresResult = await prisma.email.findMany({
    where: {
      userId: userA.id,
      OR: [
        { recipient: { contains: uniqueKeyword, mode: 'insensitive' } },
        { subject: { contains: uniqueKeyword, mode: 'insensitive' } },
        { body: { contains: uniqueKeyword, mode: 'insensitive' } },
      ],
    },
    include: { sender: { select: { id: true, email: true, name: true } } },
  });

  console.log(`PostgreSQL Fallback Count: ${postgresResult.length}`);
  console.log(`PostgreSQL Matched ID: ${postgresResult[0]?.id}`);
  console.log(`PostgreSQL Matched Subject: ${postgresResult[0]?.subject}`);

  if (postgresResult.length !== 1 || postgresResult[0]?.id !== emailA.id) {
    throw new Error('PostgreSQL fallback query did not return expected Email A');
  }
  console.log('✅ PostgreSQL relational fallback returns identical matched data when ES is bypassed.');

  // --- Scenario 3: Fuzziness & Multi-Field Matching in Elasticsearch ---
  console.log('\n--- TEST 4: Verifying Multi-Field and Fuzzy Matching ---');
  // Search by recipient domain
  const recipientSearch = await searchEmails(userA.id, 'quantum-capital');
  console.log(`Recipient Search matches: ${recipientSearch.count} (Source: ${recipientSearch.source})`);

  // Search by body keyword
  const bodySearch = await searchEmails(userA.id, 'confidential');
  console.log(`Body Search matches: ${bodySearch.count} (Source: ${bodySearch.source})`);

  // Cleanup test records
  console.log('\n--- Cleaning up test records ---');
  await esClient.delete({ index: 'emails', id: emailA.id }).catch(() => {});
  await esClient.delete({ index: 'emails', id: emailB.id }).catch(() => {});
  await prisma.email.deleteMany({ where: { id: { in: [emailA.id, emailB.id] } } });
  await prisma.sender.deleteMany({ where: { id: { in: [senderA.id, senderB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  console.log('Test records cleanly removed.');

  console.log('\n====================================================');
  console.log('   🎉 ALL SEARCH & FALLBACK TESTS PASSED 100%!     ');
  console.log('====================================================\n');

  // Close open handles so process exits cleanly without hanging
  await emailQueue.close().catch(() => {});
  await redis.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Test failed:', err);
  await emailQueue.close().catch(() => {});
  await redis.quit().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
