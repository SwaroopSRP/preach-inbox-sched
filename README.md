# PreachInbox Sched — Backend

A clean, production-minded, minimalistic TypeScript backend for scheduling, throttling, and reliably delivering emails with delayed BullMQ execution, Redis-backed rate limiting, PostgreSQL persistence, Ethereal SMTP delivery, Slack OAuth notifications, Google OAuth authentication, and Elasticsearch search projection.

---

## 1. Architecture & Design Principles

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

| Component | Role | Guarantees |
|---|---|---|
| **PostgreSQL** | Source of Truth | Durable relational storage for Users, Senders, Emails, and Slack OAuth credentials. All state transitions (`SCHEDULED` → `PROCESSING` → `SENT` / `FAILED`) are atomically guarded here. |
| **Redis** | In-Memory Coordination | Stores BullMQ delayed jobs in sorted sets (`zset`), tracks inter-email spacing reservations, and provides atomic per-sender hourly quota counters via Lua scripts. |
| **BullMQ** | Durable Queue Execution | Manages delayed job scheduling, exponential backoff retries, and worker concurrency without cron or polling loops. |
| **Elasticsearch** | Searchable Projection | Fast free-text search across recipients, subjects, and email bodies without burdening relational database queries. Tolerates offline outages via an automatic circuit breaker and PostgreSQL fallback. |
| **Ethereal Email** | External Delivery (SMTP) | Safe SMTP sandbox via Nodemailer that generates live web preview URLs for every delivered email. |
| **Slack** | External Integration | OAuth 2.0 integration that automatically posts alert messages to a team channel when a sender hits their hourly email quota. |

---

## 2. Scheduling & Execution Lifecycle

```text
1. Client POST /api/emails/schedule (recipient(s), senderId, subject, body, scheduledAt)
   ↓
2. Request validation via Zod (ensures ISO 8601 timestamps, valid emails, sender ownership)
   ↓
3. PostgreSQL: Insert Email record with status = 'SCHEDULED'
   ↓
4. BullMQ: Calculate delay = Math.max(0, scheduledAt - now)
   ↓
5. BullMQ: Enqueue job with deterministic jobId = email.id into Redis delayed sorted set
   ↓
6. Elasticsearch: Asynchronously index document projection (non-blocking)
   ↓
7. Worker picks up job when execution timestamp is reached
   ↓
8. Rate Limit & Throttle Check (Redis Lua):
   ├─► Hourly Limit Exceeded? ──► Reschedule job for top of next hour window. Notify Slack (1x/hour).
   ├─► Inter-Email Spacing Active? ──► Reschedule job for next available slot (+2000ms).
   └─► Allowed? ──► Proceed to Step 9
   ↓
9. Atomic Conditional DB Transition:
   UPDATE "Email" SET "status" = 'PROCESSING' WHERE "id" = :id AND "status" = 'SCHEDULED';
   (If 0 rows affected, duplicate/stale job is safely skipped)
   ↓
10. SMTP Delivery: Deliver via Nodemailer Ethereal SMTP
   ↓
11. On Delivery Success:
    UPDATE "Email" SET "status" = 'SENT', "sentAt" = now();
    Elasticsearch projection updated with sentAt; Ethereal preview URL logged.
   ↓
12. On Delivery Failure:
    BullMQ retry with exponential backoff (up to 3 attempts).
    If final attempt fails: UPDATE "Email" SET "status" = 'FAILED', "failedAt" = now();
```

---

## 3. Server Restart Resilience

### How delayed jobs survive backend and worker restarts
1. **Durable Redis Storage**: When an email is scheduled, BullMQ stores the job in a Redis sorted set (`bull:email-queue:delayed`) where each job is scored by its target UNIX execution millisecond. Redis persists this state to disk (via AOF / RDB).
2. **No Blind Re-Enqueueing on Startup**: Neither the Express server nor the worker recreates jobs at startup. The queue is never wiped or re-seeded from memory.
3. **Automatic Delayed Job Promotion**: BullMQ's internal timer streams listen for expired timestamps. When an API or worker process is stopped and restarted 5 minutes later, BullMQ automatically detects any delayed jobs that matured during the downtime, promotes them to the `wait` queue, and active workers immediately process them.
4. **Verified by Automated Test**: `tests/queue-restart.test.ts` enqueues a delayed job in Redis, leaves the system with no active workers while the delay matures, starts a worker after the delay, and proves the job is picked up and processed cleanly.

---

## 4. Idempotency & Duplicate Prevention

### 1. Deterministic BullMQ Job ID
Every scheduled email uses its database primary key as its BullMQ job ID:
```ts
jobId: email.id
```
BullMQ enforces uniqueness on job IDs. If the API or a client retries the scheduling call with the same ID, BullMQ refuses to create a duplicate delayed job.

### 2. Atomic Database State Transitions
Before making external SMTP network calls, the worker executes a conditional update in PostgreSQL:
```sql
UPDATE "Email" SET "status" = 'PROCESSING' WHERE "id" = :emailId AND "status" = 'SCHEDULED';
```
If two workers attempt to process the same email concurrently, only one can update the record (`count === 1`). The second worker encounters `count === 0` and safely exits immediately without double-sending.

### 3. Dual-Write Boundary & Real-World Reliability
External SMTP delivery cannot participate in an ACID transaction with PostgreSQL.
If a worker sends the email over SMTP and the worker process immediately crashes (e.g., hard server power failure) before writing `status = 'SENT'` to PostgreSQL:
- The email was delivered to the recipient.
- When the worker restarts, it may attempt a retry if the job was unacknowledged.
While this crash window is on the order of milliseconds, it represents an inherent physical property of non-transactional external APIs. The combination of deterministic `jobId`, atomic conditional DB updates, and BullMQ locking prevents application-level duplication.

---

## 5. Rate Limiting, Throttling & 1,000+ Email Load

### 1. Atomic Inter-Email Delay Throttling (`MIN_EMAIL_DELAY_MS`)
To prevent concurrent workers from blasting SMTP servers simultaneously:
- An atomic Lua script evaluates `email-delay:{senderId}` in Redis.
- Rather than putting `await sleep(...)` inside worker threads (which blocks Node.js event loops and hoards database connections), each worker atomically reserves the next dispatch slot.
- If a slot is within `MIN_EMAIL_DELAY_MS` of a previous send, the Lua script computes the exact delta `waitMs` and advances the reservation.
- The worker moves the job to BullMQ delayed status for `waitMs`.
- When 1,000+ emails are scheduled at the same second, they automatically sequence into cleanly spaced delayed jobs (e.g., 0s, 2s, 4s, 6s...) without worker deadlocks.

### 2. Atomic Hourly Rate Limiting (`MAX_EMAILS_PER_HOUR_PER_SENDER`)
- Hourly sending quota is tracked per sender using Redis keys: `email-rate:{senderId}:{YYYY-MM-DD-HH}` with a 2-hour TTL.
- An atomic Lua script checks and increments the counter:
  - If `count < MAX_HOURLY`: increments counter and grants immediate delivery permission.
  - If `count >= MAX_HOURLY`: delivery is denied.

### 3. Zero-Drop Rescheduling Strategy
- When an email is rate-limited, it is **never dropped** and **never marked as FAILED**.
- The system calculates the milliseconds remaining until the top of the next UTC hour window (`getMillisUntilNextHour()`).
- The database record's `scheduledAt` is updated to the start of the next hour window.
- The BullMQ job is moved to delayed status (`job.moveToDelayed(Date.now() + delayMs, token)`), preserving job data and FIFO order.

### 4. 1,000+ Email Load Behavior
When 1,000+ emails are scheduled for the same time:
1. They are persisted in PostgreSQL and stored as durable delayed jobs in Redis sorted sets.
2. They are **not** loaded into application heap memory all at once.
3. BullMQ workers pick up jobs up to `WORKER_CONCURRENCY` (default: 5).
4. Inter-email delay reserves successive slots: Job 1 runs at T=0, Job 2 at T=2s, Job 3 at T=4s, etc.
5. When the sender hits the hourly limit (e.g. 200/hr), jobs 201–1000 are automatically rescheduled for the next hour window and a single Slack alert is posted.

---

## 6. Integrations

### Slack OAuth Integration
- **Connect**: `GET /api/integrations/slack/connect` initiates the OAuth 2.0 flow with `chat:write` and `incoming-webhook` scopes.
- **Callback**: `GET /api/integrations/slack/callback` exchanges the authorization code with Slack's `oauth.v2.access` and persists tokens in `SlackConnection`.
- **Status**: `GET /api/integrations/slack/status` returns `{ connected: true/false, teamName, channelName }`.
- **Disconnect**: `POST /api/integrations/slack/disconnect` removes the stored credentials.
- **Deduplicated Alert**: When a sender hits their hourly quota, the worker sends a notification:
  ```text
  ⚠️ PreachInbox Alert: Sender john@example.com reached its hourly email limit of 200.
  Remaining scheduled emails will automatically continue in the next available window.
  ```
  Alerts are deduplicated per sender per hour window using an atomic Redis key (`slack-alerted:email-rate:{senderId}:{window}`) with a 3600s TTL. Even if 800 emails hit the rate limit in that hour, only **one** alert is dispatched.
- **Fault-Tolerant**: If Slack is not connected or disconnected, the system proceeds smoothly without errors.

### Google OAuth & Authentication
- **Login**: `GET /auth/google` (or `/api/auth/google`) redirects to Google's consent screen.
- **Callback**: `GET /api/auth/google/callback` exchanges the code, creates/updates the `User` in PostgreSQL, provisions a default `Sender`, sets an HTTP-only JWT cookie (`token`), and redirects to `${FRONTEND_URL}/dashboard`.
- **Current User**: `GET /api/auth/me` returns the authenticated user object from the HTTP-only cookie or `Authorization: Bearer <token>`.
- **Logout**: `POST /api/auth/logout` clears the authentication cookie.

### Elasticsearch Search Projection
- **Fields Indexed**: `id`, `userId`, `senderId`, `status`, `scheduledAt`, `sentAt`, `recipient`, `subject`, `body`.
- **Search Endpoint**: `GET /api/emails/search?q=<term>` runs a multi-match query with fuzziness, strictly isolated by `userId`.
- **Circuit Breaker & Fallback**: If Elasticsearch is offline or unreachable, the circuit breaker trips and queries automatically fall back to an internal PostgreSQL relational `ILIKE` search (`source: 'postgres_fallback'`), ensuring zero downtime for the user.

### Bull Board Queue Dashboard
- **URL**: `http://localhost:3000/admin/queues`
- Real-time visibility into **Waiting**, **Delayed**, **Active**, **Completed**, and **Failed** jobs with backoff retry controls and full payload inspection.

---

## 7. Complete API Reference

### Authentication

#### `GET /auth/google` (or `/api/auth/google`)
- **Purpose**: Initiates Google OAuth login.
- **Auth**: None.
- **Response**: `302 Redirect` to `accounts.google.com`.

#### `GET /api/auth/google/callback`
- **Purpose**: Google OAuth redirect handler.
- **Auth**: None.
- **Query Params**: `code` (string).
- **Success**: `302 Redirect` to `${FRONTEND_URL}/dashboard` with HTTP-only `token` cookie set.

#### `GET /api/auth/me`
- **Purpose**: Returns profile of current authenticated user.
- **Auth**: Cookie `token` or Header `Authorization: Bearer <token>`.
- **Success (200)**:
  ```json
  {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Jane Doe",
      "avatar": "https://..."
    }
  }
  ```

#### `POST /api/auth/logout`
- **Purpose**: Logs out user and clears cookie.
- **Auth**: None.
- **Success (200)**: `{"success": true, "message": "Logged out successfully"}`.

---

### Senders

#### `GET /api/senders`
- **Purpose**: Lists all senders owned by the authenticated user.
- **Auth**: Required.
- **Success (200)**:
  ```json
  {
    "senders": [
      {
        "id": "uuid",
        "email": "outbox@company.com",
        "name": "Company Outbox",
        "createdAt": "2026-09-04T15:00:00.000Z"
      }
    ]
  }
  ```

#### `POST /api/senders`
- **Purpose**: Creates a new sender identity for the authenticated user.
- **Auth**: Required.
- **Body**:
  ```json
  {
    "email": "sales@company.com",
    "name": "Sales Team"
  }
  ```
- **Success (201)**: Returns created sender object.

---

### Emails

#### `POST /api/emails/schedule`
- **Purpose**: Schedules one or many emails (e.g., from manual compose or CSV import).
- **Auth**: Required.
- **Body**:
  ```json
  {
    "senderId": "uuid",
    "subject": "Q3 Update",
    "body": "Hi there, here is the update...",
    "recipients": ["client1@test.com", "client2@test.com"],
    "scheduledAt": "2026-09-04T16:00:00.000Z",
    "delayMs": 2000
  }
  ```
- **Success (201)**:
  ```json
  {
    "message": "Successfully scheduled 2 email(s)",
    "emails": [
      {
        "id": "uuid-1",
        "recipient": "client1@test.com",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-04T16:00:00.000Z"
      },
      {
        "id": "uuid-2",
        "recipient": "client2@test.com",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-04T16:00:02.000Z"
      }
    ]
  }
  ```

#### `GET /api/emails/scheduled`
- **Purpose**: Lists all scheduled emails for the current user in ascending order of `scheduledAt`.
- **Auth**: Required.
- **Success (200)**: `{"emails": [...]}`.

#### `GET /api/emails/sent`
- **Purpose**: Lists all sent emails for the current user in descending order of `sentAt`.
- **Auth**: Required.
- **Success (200)**: `{"emails": [...]}`.

#### `GET /api/emails/search?q=<query>`
- **Purpose**: Free-text search across recipients, subjects, and email bodies.
- **Auth**: Required.
- **Query Params**: `q` (search string).
- **Success (200)**:
  ```json
  {
    "source": "elasticsearch",
    "count": 1,
    "emails": [...]
  }
  ```

#### `GET /api/emails/:id`
- **Purpose**: Retrieves a specific email by ID.
- **Auth**: Required (verifies ownership).
- **Success (200)**: `{"email": {...}}`.

---

### Slack Integration

#### `GET /api/integrations/slack/connect`
- **Purpose**: Redirects to Slack OAuth 2.0 authorization page.
- **Auth**: Required.

#### `GET /api/integrations/slack/callback`
- **Purpose**: Handles Slack OAuth redirect, exchanges code, and saves connection.
- **Auth**: None (uses OAuth state).

#### `GET /api/integrations/slack/status`
- **Purpose**: Checks whether the current user has connected a Slack workspace.
- **Auth**: Required.
- **Success (200)**:
  ```json
  {
    "connected": true,
    "teamName": "Outbox Labs",
    "channelName": "#alerts"
  }
  ```

#### `POST /api/integrations/slack/disconnect`
- **Purpose**: Disconnects Slack workspace for current user.
- **Auth**: Required.
- **Success (200)**: `{"success": true}`.

---

### Queue Monitoring

#### `GET /admin/queues`
- **Purpose**: Live Bull Board dashboard for queue monitoring.

---

## 8. Frontend Integration Guide

The frontend can be built cleanly against these APIs without inspecting backend source code:

1. **Authentication Flow**:
   - Point your login button to `/api/auth/google`.
   - On redirect back to `${FRONTEND_URL}/dashboard`, make a request to `GET /api/auth/me` with `credentials: 'include'` (or pass Bearer token in headers).
   - If not authenticated, redirect user to `/login`.
2. **Scheduled & Sent Emails Tabs**:
   - "Scheduled" tab calls `GET /api/emails/scheduled`.
   - "Sent" tab calls `GET /api/emails/sent`.
3. **Email Compose & CSV Upload**:
   - The frontend parses CSV files into an array of email strings: `["user1@company.com", "user2@company.com"]`.
   - Sends a single `POST /api/emails/schedule` request with `recipients: string[]`.
   - Dates must be formatted as ISO 8601 strings: `new Date(selectedTime).toISOString()`.
4. **Slack Connect Button**:
   - Check status on page load: `GET /api/integrations/slack/status`.
   - If `connected === false`, display "Connect Slack" button pointing to `GET /api/integrations/slack/connect`.
   - If `connected === true`, display "Connected to <teamName>" with a "Disconnect" button pointing to `POST /api/integrations/slack/disconnect`.
5. **Standard Error Format**:
   - All validation errors return HTTP 400:
     ```json
     {
       "error": "Validation Error",
       "details": [
         { "path": "recipients.0", "message": "Each recipient must be a valid email" }
       ]
     }
     ```

---

## 9. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Node runtime environment (`development`, `test`, `production`) |
| `PORT` | `3000` | HTTP server port |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin and OAuth redirect target |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch cluster URL |
| `ELASTICSEARCH_INDEX`| `emails` | Elasticsearch index name |
| `GOOGLE_CLIENT_ID` | — | Google Cloud Console OAuth Client ID |
| `GOOGLE_CLIENT_SECRET`| — | Google Cloud Console OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3000/api/auth/google/callback` | OAuth redirect URI registered in Google Console |
| `JWT_SECRET` | — | Secret key for signing session tokens |
| `ETHEREAL_HOST` | `smtp.ethereal.email` | Ethereal SMTP host |
| `ETHEREAL_PORT` | `587` | Ethereal SMTP port |
| `ETHEREAL_USER` | — | Ethereal username (auto-generated if omitted) |
| `ETHEREAL_PASSWORD` | — | Ethereal password (auto-generated if omitted) |
| `SLACK_CLIENT_ID` | — | Slack App OAuth Client ID |
| `SLACK_CLIENT_SECRET`| — | Slack App OAuth Client Secret |
| `SLACK_REDIRECT_URI` | `http://localhost:3000/api/integrations/slack/callback` | Redirect URL registered in Slack App |
| `WORKER_CONCURRENCY` | `5` | Number of simultaneous jobs BullMQ worker processes |
| `MIN_EMAIL_DELAY_MS` | `2000` | Minimum delay between email sends per sender (in ms) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Maximum hourly email quota per sender identity |

---

## 10. Local Development & Running

### Prerequisites
- Node.js >= 20
- PostgreSQL running locally on port 5432
- Redis running locally on port 6379

### Setup Commands
```bash
cd backend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Synchronize database schema and generate Prisma client
npm run db:push
npm run db:generate

# 4. Run automated test suite (all 24 tests across 9 test suites)
npm test

# 5. Start the Express API server (port 3000)
npm run dev

# 6. Start the standalone BullMQ email worker process
npm run worker
```

---

## 11. Assumptions & Trade-offs

1. **Dual-Write Boundary with SMTP**: External SMTP delivery cannot participate in the same ACID transaction as PostgreSQL. We prioritize application-level idempotency via deterministic `jobId` and atomic conditional status updates (`UPDATE ... WHERE status = 'SCHEDULED'`), acknowledging that a hard kernel crash during SMTP network roundtrips represents an unavoidable crash boundary common to external integrations.
2. **Elasticsearch as Projection**: Elasticsearch is never treated as the source of truth. When Elasticsearch is offline, document indexing fails silently in the background without aborting email delivery, and the search API automatically falls back to PostgreSQL relational search.
3. **Zero-Drop Rescheduling**: Rate-limited jobs are never discarded or marked as failed. They are rescheduled for the top of the next UTC hour window to preserve message integrity.
4. **Token-Based Sessions**: We use HTTP-only signed JWT cookies combined with Bearer token header support. This eliminates server-side session lookup latency while protecting against XSS and CSRF.
