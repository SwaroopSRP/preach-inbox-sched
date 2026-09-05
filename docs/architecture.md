# Architecture & System Design

This document details the high-level architecture, design decisions, data models, and trade-offs of the **PreachInbox Sched** backend service.

---

## 1. High-Level Architecture

The system is designed as an asynchronous, event-driven email scheduling and delivery platform with strict durability, idempotency, and rate-limiting guarantees.

```text
                             +-----------------------+
                             |    Frontend Client    |
                             | (React / Vite / Web)  |
                             +-----------------------+
                                         |
                                         | HTTP / REST (JWT Auth)
                                         v
                             +-----------------------+
                             |   Express 4.x REST    |
                             |      API Server       |
                             +-----------------------+
                              /          |          \
                             /           |           \
                            v            v            v
                  +------------+   +------------+   +-------------------+
                  | PostgreSQL |   |   Redis    |   |   Elasticsearch   |
                  |  (Neon DB) |   |  (Render)  |   | (Search Index)    |
                  |  Source of |   | In-Memory  |   | + Fallback Engine |
                  |   Truth    |   |    Coord   |   +-------------------+
                  +------------+   +------------+
                        ^                ^
                        |                |
                        |          +-----------+
                        |          |  BullMQ   |
                        |          | Delayed Q |
                        |          +-----------+
                        |                |
                        |                v
                        |         +-------------+
                        +---------|   Worker    |
                                  | State Mach. |
                                  +-------------+
                                     /       \
                                    /         \
                                   v           v
                          +--------------+   +---------------+
                          |   Ethereal   |   |  Slack OAuth  |
                          |  SMTP Server |   | Webhook Alert |
                          +--------------+   +---------------+
```

---

## 2. Component Responsibilities & Guarantees

| Component | Technology | Primary Responsibility | Critical Guarantees |
| :--- | :--- | :--- | :--- |
| **Relational Database** | PostgreSQL 16 (Neon) via Prisma ORM | System of Record | All state transitions (`SCHEDULED` → `PROCESSING` → `SENT` / `FAILED`) are atomically committed here. Multi-tenant data isolation by `userId`. |
| **In-Memory Coordination** | Redis 7.x (Render Managed) via `ioredis` | Queue Storage & Concurrency | Stores BullMQ delayed jobs in durable sorted sets (`zset`). Powers atomic rate-limiting Lua scripts for inter-email spacing and hourly quotas. |
| **Job Queue & Scheduling** | BullMQ 5.x | Deterministic Delayed Execution | Handles delayed execution, exponential backoff retries, and worker concurrency without cron syntax or polling loops. |
| **Search Projection** | Elasticsearch 8.x + PostgreSQL Fallback | Text Search | Multi-match text search across `recipient`, `subject`, and `body`. Protected by an automatic circuit breaker and transparent PostgreSQL fallback. |
| **SMTP Delivery Engine** | Nodemailer | Mail Dispatch | Safe sandbox email delivery via Ethereal SMTP with auto-generated web preview URLs. |
| **Alerting & Notifications** | Slack OAuth 2.0 (`chat:write`) | Operational Alerts | Dispatches an alert when a sender hits their hourly limit. Rate-limited to max 1 alert per sender per hour. |

---

## 3. Core Design Principles

### 1. PostgreSQL is the Sole Source of Truth
Redis and Elasticsearch are treated as transient or derived stores.
- If Redis is flushed or a worker crashes, the authoritative status of an email (`SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`) is always determined by PostgreSQL.
- If Elasticsearch is completely offline, all search queries automatically fall back to relational queries in PostgreSQL with zero downtime.

### 2. No Cron Jobs for Scheduling
Cron is periodic, interval-based, and imprecise for ad-hoc user-scheduled tasks (e.g. sending at `2026-09-05T14:32:15.000Z`).
- We use **BullMQ Delayed Jobs** backed by Redis Sorted Sets.
- Target delay is calculated down to the millisecond: `delayMs = Math.max(0, scheduledAt.getTime() - Date.now())`.
- Jobs remain dormant in Redis and mature precisely at the target epoch millisecond.

### 3. Non-Blocking Event Loops (No `sleep()`)
Rate limiting and inter-email spacing are managed via **Redis Lua reservations** rather than `await sleep(2000)` inside worker threads.
- Workers never block their event loops or hoard PostgreSQL connections waiting for timers to expire.
- If an email is throttled, the worker moves the job back to BullMQ delayed state (`job.moveToDelayed()`), instantly freeing the worker thread to process other senders' emails.

---

## 4. Database Schema (Prisma Data Model)

```prisma
enum EmailStatus {
  SCHEDULED
  PROCESSING
  SENT
  FAILED
}

model User {
  id              String           @id @default(uuid())
  email           String           @unique
  name            String
  avatar          String?
  googleId        String?          @unique
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  senders         Sender[]
  emails          Email[]
  slackConnection SlackConnection?

  @@index([email])
}

model Sender {
  id        String   @id @default(uuid())
  userId    String
  email     String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  emails    Email[]

  @@unique([userId, email])
  @@index([userId])
}

model Email {
  id           String      @id @default(uuid())
  userId       String
  senderId     String
  recipient    String
  subject      String
  body         String
  status       EmailStatus @default(SCHEDULED)
  scheduledAt  DateTime
  sentAt       DateTime?
  failedAt     DateTime?
  errorMessage String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  user         User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  sender       Sender      @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([userId, status])
  @@index([senderId, status])
  @@index([scheduledAt])
  @@index([status])
}

model SlackConnection {
  id          String   @id @default(uuid())
  userId      String   @unique
  slackUserId String
  teamId      String
  teamName    String
  accessToken String
  channelId   String?
  channelName String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

---

## 5. Architectural Assumptions & Trade-offs

1. **Dual-Write Boundary with External SMTP**:
   - External SMTP delivery cannot participate in an ACID transaction with PostgreSQL.
   - We mitigate this by requiring an atomic conditional update (`UPDATE "Email" SET status = 'PROCESSING' WHERE status = 'SCHEDULED'`) *before* opening the SMTP socket.
   - If the worker process suffers a hard SIGKILL after the SMTP socket completes but before updating to `SENT`, BullMQ's lock and status guard prevent application-level duplicates.

2. **Single-Service vs Split Worker Architecture**:
   - In production enterprise environments, the worker runs as a dedicated daemon process (`npm run worker`).
   - On cost-constrained deployments (such as Render Free Tier), the worker is automatically run **embedded within the main web server process** (`backend/src/server.ts`).
   - Because BullMQ is distributed and uses atomic Redis lock acquisition, whether workers run embedded or standalone, the queue execution semantics remain identical.

3. **Elasticsearch as an Ephemeral Projection**:
   - Elasticsearch is never treated as a source of truth. Document ingestion is strictly asynchronous and failure-tolerant (`.catch(() => {})`).
   - A circuit breaker trips on network timeouts, redirecting search traffic directly to PostgreSQL with zero user impact.
