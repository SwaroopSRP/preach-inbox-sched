import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

async function main() {
  const neonUrl = process.argv[2] || process.env.NEON_DATABASE_URL;

  if (!neonUrl) {
    console.error('Usage: npm run db:migrate-neon "<YOUR_NEON_DATABASE_URL>"');
    console.error('Example: npm run db:migrate-neon "postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require"');
    process.exit(1);
  }

  console.log('🚀 Starting migration to Neon PostgreSQL...');

  // 1. Run Prisma db push to create schema & tables on Neon
  console.log('📦 Step 1: Pushing Prisma schema to Neon...');
  execSync(`DATABASE_URL="${neonUrl}" npx prisma db push --skip-generate`, {
    stdio: 'inherit',
  });

  // 2. Insert data dump into Neon
  console.log('📥 Step 2: Restoring data records to Neon...');
  const dumpPath = path.resolve('prisma/local_data_dump.sql');
  if (fs.existsSync(dumpPath)) {
    execSync(`psql "${neonUrl}" < "${dumpPath}"`, {
      stdio: 'inherit',
    });
    console.log('✅ Data records imported successfully.');
  } else {
    console.log('⚠️ No local_data_dump.sql found, skipping data import.');
  }

  // 3. Verify counts in Neon
  console.log('🔍 Step 3: Verifying migrated record counts on Neon...');
  const neonPrisma = new PrismaClient({
    datasources: {
      db: { url: neonUrl },
    },
  });

  try {
    const [users, senders, emails] = await Promise.all([
      neonPrisma.user.count(),
      neonPrisma.sender.count(),
      neonPrisma.email.count(),
    ]);

    console.log('\n📊 Neon Database Record Counts:');
    console.log(`- Users:   ${users}`);
    console.log(`- Senders: ${senders}`);
    console.log(`- Emails:  ${emails}`);
    console.log('\n🎉 Migration to Neon complete!');
  } finally {
    await neonPrisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
