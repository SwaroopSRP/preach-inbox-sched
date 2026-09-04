# PreachInbox Sched — Backend

A production-minded, minimalistic TypeScript backend for scheduling, throttling, and delivering emails with delayed BullMQ execution, Redis-backed rate limiting, PostgreSQL persistence, Ethereal SMTP delivery, Slack OAuth notifications, Google OAuth authentication, and Elasticsearch search projection.

## Architecture Overview

```text
              React / Future Frontend
                         |
                         v
                    Express API
                     /   |   \
                    /    |    \
                   v     v     v
             PostgreSQL Redis Elasticsearch
                |        |
                |      BullMQ
                |        |
                |        v
                |     Worker
                |        |
                |     Ethereal
                |
                v
            Email state
```

### Core Infrastructure Responsibilities

- **PostgreSQL (Source of Truth)**: Persists durable records for Users, Senders, Emails, and Slack OAuth credentials.
- **Redis & BullMQ (Durable Execution & Throttling)**: Delayed job queue for email execution, inter-email delay throttling, and atomic per-sender hourly rate limiting.
- **Elasticsearch (Searchable Projection)**: Fast free-text search across recipients, subjects, and email bodies without querying the relational database for search.
- **Ethereal Email via Nodemailer (External Delivery)**: Safe SMTP testing environment generating live web preview URLs for sent emails.
- **Slack (External Integration)**: OAuth 2.0 integration notifying team channels when a sender reaches their hourly sending limit.

---

## Project Status & Milestones

- [x] Base project setup (TypeScript, Express, Zod env validation, error handling)
- [x] Database schema & Prisma setup
- [x] Redis & BullMQ delayed queue
- [x] Email scheduling APIs
- [x] Ethereal SMTP delivery & worker
- [x] Idempotency & duplicate prevention
- [ ] Rate limiting, throttling & rescheduling

---

## Idempotency & Reliability Model

### 1. Deterministic Job Deduplication
Every scheduled email is enqueued with `jobId: email.id`. If an enqueue operation is retried or repeated, BullMQ refuses to create a duplicate job with the same ID in the queue.

### 2. Atomic Database State Transitions
Before initiating external network calls (SMTP delivery), the worker executes an atomic conditional update on PostgreSQL:
```sql
UPDATE "Email" SET "status" = 'PROCESSING' WHERE "id" = :emailId AND "status" = 'SCHEDULED';
```
If multiple workers concurrently receive the same job ID or retry, only one worker transitions the row (`count === 1`). The other workers encounter `count === 0` and safely exit immediately without delivering duplicate emails.

### 3. Dual-Write Boundary Limitations (Honest Assessment)
External SMTP delivery via TCP/TLS cannot participate in a 2-Phase Commit (2PC) or distributed transaction with PostgreSQL.
If a worker delivers an email to the SMTP server and immediately suffers a hard SIGKILL/kernel crash before the subsequent `status = SENT` database write completes:
- The email was delivered to the recipient.
- On worker recovery, the job may retry if unacknowledged.
While this crash window is on the order of milliseconds, it represents an inherent physical property of non-transactional external APIs. The combination of deterministic `jobId`, atomic DB transitions, and conditional status checks eliminates duplicate application scheduling and race conditions across concurrent workers.

## Restart Persistence Architecture

Delayed email scheduling relies on **BullMQ delayed jobs backed by Redis sorted sets (`zset`)**:
1. When an email is scheduled, an `Email` record is atomically created in PostgreSQL (`SCHEDULED`).
2. A job is enqueued in BullMQ with deterministic ID `email.id` and a calculated delay: `Math.max(0, scheduledAt.getTime() - Date.now())`.
3. Redis stores delayed jobs durably in a Redis sorted set scored by execution timestamp (`bull:<queue>:delayed`).
4. Even if the API server or worker process crashes or is restarted:
   - No jobs are lost because Redis persists the state to disk (AOF/RDB).
   - Neither the API nor the worker blindly re-enqueues jobs upon startup, preventing duplicates.
   - Once workers come back online, BullMQ's timer streams and delayed job promoter automatically promote matured jobs to the active queue for immediate processing.
- [ ] Ethereal SMTP delivery & worker
- [ ] Idempotency & duplicate prevention
- [ ] Rate limiting, throttling & rescheduling
- [ ] Slack OAuth & rate limit notifications
- [ ] Google OAuth & authentication
- [ ] Elasticsearch projection & search
- [ ] Bull Board queue dashboard
- [ ] Automated tests & verification
