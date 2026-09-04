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

---

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
