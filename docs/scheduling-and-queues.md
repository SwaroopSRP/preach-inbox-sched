# Scheduling, BullMQ Queues & Idempotency

This document details the scheduling lifecycle, BullMQ queue architecture, restart persistence, and idempotency guarantees in **PreachInbox Sched**.

---

## 1. End-to-End Scheduling Lifecycle

```text
1. Client POST /api/emails/schedule
   │ { senderId, recipients: [...], subject, body, scheduledAt, delayMs }
   ▼
2. Request Validation (Zod Schema)
   │ Validates ISO 8601 timestamps, recipient emails, sender ownership
   ▼
3. PostgreSQL Record Insertion
   │ Inserts Email rows with status = 'SCHEDULED', scheduledAt = targetTime
   ▼
4. BullMQ Delayed Enqueueing
   │ Calculates delay = targetTime - now
   │ Enqueues job with deterministic jobId = email.id into Redis zset
   ▼
5. Elasticsearch Async Projection
   │ Asynchronously indexes document into Elasticsearch (non-blocking)
   ▼
6. BullMQ Worker Picks Up Job (Delay Matures)
   ▼
7. Rate Limiter & Throttling Check (Redis Lua Scripts)
   ├─► Hourly Quota Exceeded? ──► Reschedule for next hour window. Notify Slack.
   ├─► Inter-Email Spacing Active? ──► Reschedule job for next slot (+2000ms).
   └─► Allowed? ──► Proceed
   ▼
8. Atomic PostgreSQL Transition Lock
   │ UPDATE "Email" SET status = 'PROCESSING' WHERE id = :id AND status = 'SCHEDULED';
   │ (If 0 rows affected, duplicate/stale job is safely skipped)
   ▼
9. SMTP Transmission
   │ Dispatches mail via Nodemailer Ethereal SMTP
   ▼
10. Final State Transition
    ├─► Success: UPDATE "Email" SET status = 'SENT', sentAt = now();
    └─► Failure: Retry with exponential backoff (max 3 attempts).
                 If final attempt fails: UPDATE "Email" SET status = 'FAILED';
```

---

## 2. Why BullMQ Delayed Jobs Instead of Cron?

A hard requirement of this project is **strict avoidance of cron**. Here is why:

| Dimension | Cron-Based Scheduling | BullMQ Delayed Jobs (Our Implementation) |
| :--- | :--- | :--- |
| **Precision** | Interval-based (e.g. runs every 1 minute or 5 minutes). Cannot schedule an email for `14:23:42.150Z`. | Millisecond precision. Jobs mature at the exact epoch millisecond specified. |
| **Database Load** | Continuous polling queries (`SELECT * WHERE scheduledAt <= NOW()`) running every few seconds, taxing the database. | Zero database polling. Redis manages timers internally via sorted sets (`zset`). |
| **Scalability** | Polling locks rows in SQL, creating database contention and race conditions when scaling worker instances. | Native distributed locking. Workers atomically claim jobs via Redis Lua scripts with zero lock contention. |
| **Ad-Hoc Flexibility** | Awkward to schedule arbitrary one-off dates across thousands of different users. | Every job is an independent, first-class delayed task. |

---

## 3. Restart Persistence Guarantees

### What happens when the server, worker, or database restarts?

1. **Redis Sorted Sets**:
   When an email is scheduled, BullMQ adds the job to a Redis sorted set:
   ```text
   Key: bull:email-queue:delayed
   Score: <Epoch millisecond timestamp of scheduledAt>
   Value: <Job Payload with emailId>
   ```
   Redis keeps this data persisted in memory and writes to disk (RDB/AOF).

2. **Zero Job Re-creation on Boot**:
   Neither the API server nor the worker recreates jobs on startup. The queue is never re-seeded or wiped from memory.

3. **No "Day 1" Resets**:
   If an email was scheduled 3 days into the future and the server reboots 10 times, the job's scheduled target time remains unchanged in Redis.

4. **Matured Jobs Catch-Up**:
   If the worker is offline when a job matures (e.g., during maintenance or Render sleep), the moment the worker process starts up, BullMQ immediately identifies that the job's epoch score is $\le \text{now()}$, shifts it to the `active` queue, and delivers it immediately.

5. **Automated Verification**:
   This guarantee is strictly verified by [`tests/queue-restart.test.ts`](file:///home/srp/Documents/Work/Projects/preach-inbox-sched/backend/tests/queue-restart.test.ts):
   - Enqueues a delayed job in Redis.
   - Completely closes/kills all workers while the timer matures.
   - Starts a new worker after the delay has passed.
   - Proves the matured job is processed and delivered cleanly.

---

## 4. 3-Layer Idempotency & Duplicate Prevention

To guarantee that **no email is ever sent more than once**, the system enforces three independent defense layers:

```text
Layer 1: Deterministic BullMQ Job ID
         jobId = email.id
         (Prevents duplicate job creation in Redis)
                        │
                        ▼
Layer 2: Worker Pre-Execution Check
         if (email.status !== 'SCHEDULED') return;
         (Skips jobs already marked as SENT or PROCESSING)
                        │
                        ▼
Layer 3: Atomic PostgreSQL Conditional Update
         UPDATE "Email" SET status = 'PROCESSING'
         WHERE id = :id AND status = 'SCHEDULED';
         (Guarantees concurrency isolation across multiple workers)
```

### Layer 1: Deterministic BullMQ Job ID
In [`backend/src/queue/email.queue.ts`](file:///home/srp/Documents/Work/Projects/preach-inbox-sched/backend/src/queue/email.queue.ts):
```typescript
await emailQueue.add(
  'send-email',
  { emailId },
  {
    jobId: emailId, // Enforces uniqueness in Redis
    delay: safeDelay,
  }
);
```
BullMQ rejects or ignores any attempt to enqueue a job with an ID that already exists in the queue.

### Layer 2: Worker Pre-Execution Check
When a worker picks up a job, it inspects the PostgreSQL record:
```typescript
const email = await prisma.email.findUnique({ where: { id: emailId } });
if (!email || email.status !== 'SCHEDULED') {
  logger.warn(`Email ${emailId} is in status '${email?.status}'. Skipping duplicate execution.`);
  return;
}
```

### Layer 3: Atomic State Transition Lock
To prevent race conditions where two workers concurrently process the same job:
```typescript
const updateResult = await prisma.email.updateMany({
  where: {
    id: emailId,
    status: 'SCHEDULED',
  },
  data: {
    status: 'PROCESSING',
  },
});

if (updateResult.count === 0) {
  logger.warn(`Email ${emailId} concurrent transition lost. Skipping.`);
  return;
}
```
In relational databases, `UPDATE ... WHERE status = 'SCHEDULED'` holds an exclusive row-level lock during evaluation. Exactly one worker will obtain `count === 1`. Any competing worker gets `count === 0` and terminates without touching the SMTP socket.

---

## 5. Rate Limiting & Throttling Engine

Rate limits are enforced per-sender in Redis using atomic Lua scripts in [`backend/src/workers/rate-limiter.ts`](file:///home/srp/Documents/Work/Projects/preach-inbox-sched/backend/src/workers/rate-limiter.ts).

### 1. Inter-Email Delay Throttling (`MIN_EMAIL_DELAY_MS = 2000`)
To protect sender reputation and prevent SMTP server connection flooding:
- A Lua script inspects key `email-delay:{senderId}` in Redis.
- Rather than executing `await sleep(2000)` inside worker threads (which blocks event loops and exhausts database connection pools), the script atomically reserves the next available timestamp slot:
  $$\text{nextAvailable} = \max(\text{now}, \text{currentAvailable}) + \text{MIN\_DELAY}$$
- If the current time is before the reserved slot, the script returns the exact delta in milliseconds.
- The worker moves the job back to BullMQ delayed state:
  ```typescript
  await job.moveToDelayed(Date.now() + delayMs, token);
  ```

### 2. Hourly Quota Enforcement (`MAX_EMAILS_PER_HOUR_PER_SENDER = 200`)
- Key: `email-rate:{senderId}:{YYYY-MM-DD-HH}` with a 2-hour sliding TTL.
- Atomic Lua script increments and checks:
  ```lua
  local current = tonumber(redis.call('GET', rateKey) or "0")
  if current < maxLimit then
    local newCount = redis.call('INCR', rateKey)
    if newCount == 1 then redis.call('EXPIRE', rateKey, 7200) end
    return { 1, newCount }
  else
    return { 0, current }
  end
  ```

### 3. Zero-Drop Rescheduling Policy
When a sender hits their hourly limit:
1. **The email is never dropped, discarded, or marked as FAILED.**
2. The system computes milliseconds until the top of the next UTC hour window.
3. The database `scheduledAt` is updated to reflect the new delivery window.
4. The BullMQ job is moved to delayed status for that duration.
5. A deduplicated Slack alert is triggered (at most once per sender per hour).

---

## 6. Behavior Under 1,000+ Email Load

When a user uploads a CSV and schedules 1,000+ emails at the same second:

1. **Storage**: All 1,000 records are written to PostgreSQL and enqueued in BullMQ as delayed jobs in Redis.
2. **Memory Safety**: Jobs are **not** loaded into Node.js heap memory simultaneously. BullMQ workers only pull up to `WORKER_CONCURRENCY` (default: 5) jobs at a time.
3. **Automatic Serialization**:
   - Job 1 executes at $T = 0\text{s}$.
   - Job 2 is delayed to $T = 2\text{s}$.
   - Job 3 is delayed to $T = 4\text{s}$.
   - ...
   - Job 200 is delayed to $T = 398\text{s}$.
4. **Hourly Cutoff**:
   - Jobs 201 through 1,000 hit the `MAX_EMAILS_PER_HOUR_PER_SENDER = 200` quota check.
   - The worker automatically moves them to the next UTC hour window ($T + 3600\text{s}$).
   - A single Slack alert is dispatched to notify the team.
   - System CPU, memory, and database connections remain flat and stable throughout.
