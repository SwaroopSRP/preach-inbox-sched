# PreachInbox Backend Engine

A high-throughput, restart-resilient email scheduling, rate-limiting, and delivery engine built with **Node.js**, **Express**, **TypeScript**, **BullMQ**, **Redis**, **PostgreSQL (Neon)**, and **Elasticsearch**.

---

## 🏗️ Architecture & Capabilities

- **Strictly Zero-Cron Scheduling**: Millisecond-precision BullMQ delayed jobs backed by Redis sorted sets (`bull:email-queue:delayed`). Zero periodic database polling loops.
- **Restart Durability**: All jobs persist in Redis memory and disk. No "Day 1" resets; matured jobs catch up automatically when the worker process boots.
- **Rate-Limiting & Event Loop Safety**: Atomic Redis Lua scripts enforce $2000\text{ms}$ inter-email spacing per sender (`moveToDelayed` without `sleep()`) and $200\text{ emails/hr}$ sender caps.
- **Deduplicated Slack Alerts**: Alerts a designated Slack channel when a sender hits their hourly limit (max 1 notification per sender per hour).
- **Search Engine with Fallback**: Elasticsearch 9.x multi-match search across recipient, subject, and body, with automatic circuit breaker fallback to PostgreSQL `ILIKE` queries.
- **Dual Authentication**: Google OAuth 2.0 OpenID Connect (`openid`, `email`, `profile`) and Email/Password with `bcryptjs` hashing. Secure `HttpOnly; SameSite=Lax` JWT cookies.
- **Queue Admin Dashboard**: Embedded Bull Board visual UI at `/admin/queues`.

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js >= 20
- PostgreSQL database (local or [neon.tech](https://neon.tech))
- Redis instance (local or [Render Managed Redis](https://dashboard.render.com))

### 2. Installation & Configuration
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, REDIS_URL, etc.

# 3. Synchronize database schema & generate Prisma client
npm run db:push
npm run db:generate
```

### 3. Running the Server & Worker
```bash
# Start Express API Server (runs on http://localhost:3000)
# Note: In development and production, the BullMQ worker is embedded within the server process
npm run dev

# (Optional) Run worker in a standalone process:
npm run worker
```

---

## 🧪 Testing & Verification Scripts

### Automated Test Suite
The backend includes 32 automated unit and integration tests across 10 suites verifying authentication, worker concurrency, restart persistence, and rate-limiting:
```bash
npm test
```

### Standalone Verification Scripts
```bash
# 1. Verify Ethereal SMTP delivery and generate live preview URL
npx tsx src/scripts/test-ethereal.ts

# 2. Verify complete lifecycle (DB -> BullMQ Delayed Queue -> Worker -> Ethereal)
npx tsx src/scripts/test-end-to-end-email.ts

# 3. Verify Elasticsearch cluster connectivity & indexing
npx tsx src/scripts/test-elasticsearch.ts

# 4. Run automated 15-step blackbox systems test (zero mocks, real HTTP)
npm run test:system

# 5. Live Bull Board demo (schedules 5 staggered emails for live monitoring)
npx tsx src/scripts/demo-live-schedule.ts
```

---

## 📚 Complete Documentation Links

- **[System Architecture & Design](../docs/architecture.md)**
- **[Scheduling, BullMQ & Idempotency](../docs/scheduling-and-queues.md)**
- **[Complete REST API Reference](../docs/api-reference.md)**
- **[Frontend Architecture Guide](../docs/frontend.md)**
- **[Deployment & Cloud Operations](../docs/deployment-and-operations.md)**
