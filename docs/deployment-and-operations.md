# Deployment & Operations Guide

This document covers production deployment, infrastructure setup, operational considerations, and keepalive configurations for **PreachInbox Sched**.

---

## 1. Live Production Deployment

- **Public Backend API**: [`https://preach-inbox-api.onrender.com`](https://preach-inbox-api.onrender.com)
- **Live Health & Probe Endpoint**: [`https://preach-inbox-api.onrender.com/health`](https://preach-inbox-api.onrender.com/health)
- **Live BullMQ Queue Dashboard**: [`https://preach-inbox-api.onrender.com/admin/queues/`](https://preach-inbox-api.onrender.com/admin/queues/)

---

## 2. Infrastructure Architecture on Cloud

```text
               +--------------------------------------------+
               |              Render Cloud                  |
               |                                            |
               |  +--------------------------------------+  |
               |  | Web Service: preach-inbox-api        |  |
               |  | - Express API (Port 3000)            |  |
               |  | - Embedded BullMQ Email Worker       |  |
               |  +--------------------------------------+  |
               |                     |                      |
               |  +------------------v-------------------+  |
               |  | Redis: preach-inbox-redis (Internal) |  |
               |  +--------------------------------------+  |
               +---------------------|----------------------+
                                     |
                                     v
                       +----------------------------+
                       |    Neon PostgreSQL Cloud   |
                       |    Serverless Autoscaling  |
                       +----------------------------+
```

---

## 3. Database Setup (Neon PostgreSQL)

1. Create a database on [neon.tech](https://neon.tech).
2. Copy the Connection String (ensure `?sslmode=require` is present).
3. Push schema to Neon:
   ```bash
   cd backend
   npx prisma db push
   ```
4. Optional: If you need to migrate existing local data to Neon:
   ```bash
   npm run db:migrate-neon
   ```

---

## 4. Redis Setup (Render Managed Redis)

1. In the [Render Dashboard](https://dashboard.render.com), click **New +** ➔ **Redis**.
2. Name: `preach-inbox-redis`, Plan: **Free**.
3. Copy the **Internal Redis URL** (`redis://red-xxxx:6379`).
4. In your Web Service (`preach-inbox-api`) ➔ **Environment** tab:
   - Add: `REDIS_URL` = `<Internal Redis URL>`
5. Click **Save Changes**.

---

## 5. BullMQ Embedded Worker Execution

On Render's Free tier, background worker services are not available for free (they require the paid Starter plan).

To deliver a **100% functional, self-contained deployment at $0 cost**:
- In [`backend/src/server.ts`](file:///home/srp/Documents/Work/Projects/preach-inbox-sched/backend/src/server.ts), the BullMQ Email Worker is automatically initialized inside the web service process.
- The single Render web service runs **both** the Express API and the BullMQ background worker concurrently.
- If you scale to multiple container instances or a standalone worker later, BullMQ’s distributed Redis locking seamlessly balances jobs across instances without double-sending.

---

## 6. Ethereal Email Configuration

The mailer supports two modes:

### Mode A: Zero-Config Auto Mode (Default)
Leave `ETHEREAL_USER` and `ETHEREAL_PASSWORD` blank.
- Nodemailer dynamically generates a test account at startup.
- Every email sent logs its direct web preview link (`https://ethereal.email/message/...`).

### Mode B: Dedicated Mailbox (Recommended for Demos)
1. Visit **[https://ethereal.email/create](https://ethereal.email/create)**.
2. Click **Create Ethereal Account**.
3. Copy the generated Email and Password.
4. Set in your `.env` or Render Environment variables:
   ```env
   ETHEREAL_USER=your-account@ethereal.email
   ETHEREAL_PASSWORD=your-password
   ```
5. Log into **[https://ethereal.email/messages](https://ethereal.email/messages)**. All dispatched emails will land in your permanent web inbox!

---

## 7. Keepalive Cron Configuration (Preventing Cold Starts)

Render free instances spin down after 15 minutes of inactivity.

To keep the instance permanently warm for reviewer evaluations:
1. Use a free monitoring service like [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com).
2. Target: `https://preach-inbox-api.onrender.com/health` (or `https://preach-inbox-api.onrender.com/`).
3. Method: `GET`.
4. Interval: **Every 10 to 14 minutes**.

### Important Policy & Quota Considerations:
- **No Account Suspension**: Pingers and uptime monitors are standard practice across the developer community. Render does not ban or suspend accounts for uptime pinging.
- **750 Free Instance Hours Limit**: Render provides 750 free instance hours per calendar month per account. A single service running continuously 24/7 consumes $24 \times 31 = 744$ hours, which stays safely within the 750-hour allowance.

---

## 8. Elasticsearch Considerations (Why 0.1 CPU / 512MB RAM Fails)

### Technical Analysis:
Running Elasticsearch on a 0.1 CPU / 512 MB RAM container will fail:
1. **JVM & Lucene Memory**: Even with minimal heap (`-Xms200m -Xmx200m`), JVM Metaspace, thread stacks, and Lucene off-heap page cache require at least 800MB–1.2GB. The Linux kernel OOM Killer will kill the container (`SIGKILL / Exit 137`).
2. **0.1 CPU Throttling**: JVM JIT compilation on 100 millicores takes 4–7 minutes to boot, triggering deployment health check timeouts.

### Our Resilient Solution:
Our codebase includes an automatic circuit breaker and transparent PostgreSQL fallback:
```typescript
try {
  const esHits = await esSearch(userId, query);
  return { source: 'elasticsearch', count: esHits.length, emails: esHits };
} catch (err) {
  // Graceful fallback to PostgreSQL ILIKE
  const emails = await prisma.email.findMany(...);
  return { source: 'postgres_fallback', count: emails.length, emails };
}
```
If you wish to attach a real Elasticsearch cluster for free, we recommend [Bonsai.io](https://bonsai.io) (free sandbox tier) and adding its URL to `ELASTICSEARCH_URL`.

---

## 9. Verification Scripts

The repository includes ready-to-run verification scripts in `backend/src/scripts/`:

```bash
cd backend

# 1. Test direct SMTP delivery to Ethereal
npx tsx src/scripts/test-ethereal.ts

# 2. Test full end-to-end flow: DB -> BullMQ Delayed Queue -> Worker -> Ethereal
npx tsx src/scripts/test-end-to-end-email.ts
```
