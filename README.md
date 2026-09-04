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
- [ ] Database schema & Prisma setup
- [ ] Redis & BullMQ delayed queue
- [ ] Email scheduling APIs
- [ ] Ethereal SMTP delivery & worker
- [ ] Idempotency & duplicate prevention
- [ ] Rate limiting, throttling & rescheduling
- [ ] Slack OAuth & rate limit notifications
- [ ] Google OAuth & authentication
- [ ] Elasticsearch projection & search
- [ ] Bull Board queue dashboard
- [ ] Automated tests & verification
