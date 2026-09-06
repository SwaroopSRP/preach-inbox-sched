# PreachInbox Sched

A robust, production-minded TypeScript email scheduling, rate-limiting, and delivery engine built for high throughput, restart resilience, and zero duplicate dispatches.

---

## 🌐 Live Production Deployment

The backend service is deployed and live on cloud infrastructure:

| Resource | Public URL | Description |
| :--- | :--- | :--- |
| **API Base URL** | [`https://preach-inbox-api.onrender.com`](https://preach-inbox-api.onrender.com) | Production REST API on Render |
| **Live Health Probe** | [`https://preach-inbox-api.onrender.com/health`](https://preach-inbox-api.onrender.com/health) | Real-time DB & Redis latency probes |
| **BullMQ Admin Dashboard** | [`https://preach-inbox-api.onrender.com/admin/queues/`](https://preach-inbox-api.onrender.com/admin/queues/) | Visual queue & job monitoring UI |

---

## 📂 Repository Structure

This repository is structured as a monorepo housing the backend engine, architectural documentation, and the upcoming frontend client:

```text
preach-inbox-sched/
├── backend/                  # TypeScript Express API, BullMQ Worker & Prisma ORM
│   ├── prisma/               # PostgreSQL schema & migrations
│   ├── src/
│   │   ├── config/           # Validated Zod environment configuration
│   │   ├── integrations/     # Ethereal SMTP & Nodemailer transport
│   │   ├── lib/              # Prisma, Redis (ioredis), Elasticsearch & Logger clients
│   │   ├── middleware/       # JWT Auth & centralized error handling
│   │   ├── modules/          # Auth (Google OAuth), Emails, Senders, Slack OAuth
│   │   ├── queue/            # BullMQ email queue & Bull Board adapter
│   │   ├── scripts/          # Verification scripts (Ethereal, Elasticsearch, Neon migration)
│   │   └── workers/          # BullMQ email worker & atomic Redis rate limiter
│   └── tests/                # 32 automated unit & integration tests (Vitest)
├── docs/                     # Comprehensive engineering specifications & guides
│   ├── architecture.md       # High-level architecture, data models & design trade-offs
│   ├── scheduling-and-queues.md # BullMQ delayed jobs, restart durability & idempotency
│   ├── api-reference.md      # Complete REST API reference with schemas & examples
│   ├── frontend-integration.md # Frontend dev guide: Types, auth flow, CSV upload & tabs
│   └── deployment-and-operations.md # Render, Neon DB, Redis, Ethereal & keepalive setup
├── render.yaml               # Infrastructure-as-Code Blueprint for Render deployment
└── README.md                 # Project overview & documentation index
```

---

## 📚 Complete Engineering Documentation

To ensure high maintainability and ease of assessment, the documentation is divided into focused specifications:

1. **[Architecture & System Design](docs/architecture.md)**
   *System topology, PostgreSQL as source of truth, non-blocking event loops, Prisma data models, and dual-write boundary analysis.*

2. **[Scheduling, BullMQ Queues & Idempotency](docs/scheduling-and-queues.md)**
   *Deep dive into BullMQ delayed jobs vs Cron (why NO cron was used), Redis sorted sets for restart durability, 3-layer idempotency defense, leaky-bucket inter-email delay ($2000\text{ms}$), hourly sender caps ($200\text{/hr}$), and 1,000+ batch email load behavior.*

3. **[Complete API Reference](docs/api-reference.md)**
   *Full REST specification covering Authentication, Senders, Email Scheduling, Email Retrieval, Search, Slack OAuth, Health probes, and error schemas with JSON examples.*

4. **[Frontend Integration Guide](docs/frontend-integration.md)**
   *Step-by-step instructions for frontend engineers: TypeScript types, Google OAuth session handling with HTTP-only cookies, CSV recipient parsing, Scheduled vs. Sent tabs, search debouncing, and Slack connection widgets.*

5. **[Deployment & Cloud Operations Guide](docs/deployment-and-operations.md)**
   *Live Render deployment details, Neon serverless PostgreSQL setup, Render Managed Redis, Ethereal SMTP mailbox options, keepalive cron setup (safely preventing cold starts within the 750h limit), and Elasticsearch considerations.*

---

## 🎯 Hard Requirements & Architectural Guarantees

| Requirement | Implementation | Guarantee |
| :--- | :--- | :--- |
| **BullMQ Delayed Scheduling** | `emailQueue.add('send-email', { emailId }, { jobId: emailId, delay })` | **Strictly NO cron.** Millisecond-precision scheduling backed by Redis sorted sets. Zero polling loops. |
| **Restart Durability** | Redis Sorted Sets (`bull:email-queue:delayed`) | State survives container reboots or host crashes. Matured jobs automatically catch up upon worker restart. **No Day 1 resets.** |
| **Zero Duplicate Sends** | 3-Layer Idempotency Guard | 1. Deterministic BullMQ `jobId = email.id`<br>2. Pre-execution database status checks<br>3. Atomic conditional update: `UPDATE ... WHERE status = 'SCHEDULED'` |
| **Inter-Email Spacing** | Atomic Redis Lua reservations | Enforces minimum $2000\text{ms}$ spacing between dispatches per sender. Jobs are rescheduled without blocking Node.js event loops (`no sleep()`). |
| **Hourly Quota Enforcement** | Redis key `email-rate:{senderId}:{hour}` | Caps dispatches at $200\text{ emails/hr}$ per sender. Excess emails are cleanly rescheduled for the next UTC hour window (zero drops). |
| **Slack Rate-Limit Alerting** | Slack OAuth 2.0 Webhook Integration | Automatically alerts a designated Slack channel when a sender hits their limit. Deduplicated to max 1 notification per sender per hour. |
| **Safe Mailbox Sandbox** | Ethereal SMTP via Nodemailer | Dispatches to safe test mailboxes and generates live HTML/plain-text preview URLs. |
| **Search Engine & Fallback** | Elasticsearch + PostgreSQL Fallback | Multi-match search across recipient, subject, and body. Automatic circuit breaker falls back to PostgreSQL relational search if Elasticsearch is offline. |
| **Dual Authentication** | Google OAuth 2.0 + Email/Password | Real Google OAuth OpenID Connect (`openid`, `email`, `profile`) and traditional Email/Password with `bcryptjs` hashing. Both issue unified HTTP-only JWT cookies. |

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- Node.js >= 20
- PostgreSQL (local or remote Neon instance)
- Redis (local or remote Redis instance)

### 2. Setup & Installation
```bash
# Clone repository
git clone https://github.com/SwaroopSRP/preach-inbox-sched.git
cd preach-inbox-sched/backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Update DATABASE_URL and REDIS_URL in .env if needed

# Synchronize database schema & generate Prisma client
npm run db:push
npm run db:generate
```

### 3. Run Automated Tests
The test suite contains 32 end-to-end and unit tests across 10 suites verifying authentication, queues, worker state machines, concurrency locks, restart persistence, and rate-limiting:
```bash
npm test
```

### 4. Run Development Server
```bash
# Terminal 1: Start Express API server (port 3000)
npm run dev

# Terminal 2 (Optional if testing standalone worker process):
npm run worker
```

*Note: In production on Render, the worker is automatically embedded within the main web server process for zero-cost single-instance execution.*

---

## 🧪 Live Verification Scripts

To verify components independently, run the included verification scripts:

```bash
cd backend

# 1. Verify Ethereal SMTP delivery and obtain a live preview URL
npx tsx src/scripts/test-ethereal.ts

# 2. Verify full lifecycle (DB -> BullMQ Delayed Queue -> Worker -> Ethereal)
npx tsx src/scripts/test-end-to-end-email.ts

# 3. Verify Elasticsearch cluster connectivity & indexing
npx tsx src/scripts/test-elasticsearch.ts
```

