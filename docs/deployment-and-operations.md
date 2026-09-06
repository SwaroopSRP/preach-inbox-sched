# Deployment & Operations Guide

This document covers production cloud deployment, infrastructure setup, operational considerations, and keepalive configurations for **PreachInbox Sched**.

---

## 1. Live Production Deployment

The backend service is currently deployed and live on cloud infrastructure:

- **Public Backend API**: [`https://preach-inbox-api.onrender.com`](https://preach-inbox-api.onrender.com)
- **Live Health & Latency Probe**: [`https://preach-inbox-api.onrender.com/health`](https://preach-inbox-api.onrender.com/health)
- **Live BullMQ Queue Dashboard**: [`https://preach-inbox-api.onrender.com/admin/queues/`](https://preach-inbox-api.onrender.com/admin/queues/)
- **Live Privacy Policy**: [`https://preach-inbox-api.onrender.com/privacy-policy`](https://preach-inbox-api.onrender.com/privacy-policy)

---

## 2. Cloud Infrastructure Architecture

```text
               +-------------------------------------------------------+
               |                     Render Cloud                      |
               |                                                       |
               |  +-------------------------------------------------+  |
               |  | Web Service: preach-inbox-api                   |  |
               |  | - Express REST API (Port 3000)                  |  |
               |  | - Embedded BullMQ Email Worker                  |  |
               |  +-------------------------------------------------+  |
               |                           |                           |
               |  +------------------------v------------------------+  |
               |  | Managed Redis: preach-inbox-redis (Internal)    |  |
               |  +-------------------------------------------------+  |
               +---------------------------|---------------------------+
                             |             |             |
                             v             v             v
                +-----------------+  +-----------+  +------------------+
                | Neon PostgreSQL |  | Ethereal  |  |  Elastic Cloud   |
                | Serverless DB   |  |   SMTP    |  |  Elasticsearch   |
                | (Source of      |  | (Sandbox  |  |  (Search Index + |
                |  Truth)         |  |  Mailbox) |  |   Circuit Brkr)  |
                +-----------------+  +-----------+  +------------------+
```

---

## 3. Environment Variables Reference

When deploying to Render or configuring local development, ensure the following environment variables are set in the service dashboard or `.env`:

| Variable Name | Required | Description | Example / Production Value |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | HTTP listen port (Render injects 10000 automatically) | `3000` |
| `NODE_ENV` | Yes | Environment mode | `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection string with SSL | `postgresql://neondb_owner:***@ep-***.neon.tech/neondb?sslmode=require` |
| `REDIS_URL` | Yes | Redis connection string (internal Render network) | `redis://red-cv7n00u3esus73c52e40:6379` |
| `FRONTEND_URL` | Yes | Allowed CORS origin and post-auth redirect target | `http://localhost:5173` or production domain |
| `JWT_SECRET` | Yes | Secret key used to sign session cookies | `super-secret-jwt-key` |
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud Console OAuth 2.0 Web Client ID | `716221864428-srjbiig821k2nsf1k1e814gq9fh11h7l.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud Console OAuth 2.0 Client Secret | `GOCSPX-***` |
| `GOOGLE_REDIRECT_URI` | Yes | Google OAuth Authorized Redirect URI | `https://preach-inbox-api.onrender.com/api/auth/google/callback` |
| `ELASTICSEARCH_URL` | Optional | Remote Elasticsearch cluster endpoint | `https://***.es.io:9243` |
| `ELASTICSEARCH_API_KEY` | Optional | Elasticsearch cluster base64 API key | `***` |
| `SLACK_CLIENT_ID` | Optional | Slack App OAuth Client ID | `***` |
| `SLACK_CLIENT_SECRET` | Optional | Slack App OAuth Client Secret | `***` |
| `SLACK_REDIRECT_URI` | Optional | Slack OAuth Redirect URI | `https://preach-inbox-api.onrender.com/api/integrations/slack/callback` |
| `ETHEREAL_USER` | Optional | Dedicated Ethereal mailbox username | `your-account@ethereal.email` |
| `ETHEREAL_PASSWORD` | Optional | Dedicated Ethereal mailbox password | `your-password` |

---

## 4. Database Setup (Neon PostgreSQL)

1. Create a serverless database on [neon.tech](https://neon.tech).
2. Copy the Connection String (ensure `?sslmode=require` is present).
3. Push schema to Neon:
   ```bash
   cd backend
   npx prisma db push
   ```
4. Optional: If migrating local development data to Neon:
   ```bash
   npm run db:migrate-neon
   ```

---

## 5. Redis Setup (Render Managed Redis)

1. In the [Render Dashboard](https://dashboard.render.com), click **New +** ➔ **Redis**.
2. Name: `preach-inbox-redis`, Plan: **Free**.
3. Copy the **Internal Redis URL** (`redis://red-xxxx:6379`).
4. In the Web Service (`preach-inbox-api`) ➔ **Environment** tab:
   - Add: `REDIS_URL` = `<Internal Redis URL>`
5. Click **Save Changes**.

---

## 6. BullMQ Embedded Worker Architecture

On Render's Free tier, background worker processes are not available at $0 (they require the paid Starter plan).

To deliver a **100% functional, production-grade deployment at zero cost**:
- In [`backend/src/server.ts`](file:///home/srp/Documents/Work/Projects/preach-inbox-sched/backend/src/server.ts), the BullMQ Email Worker is automatically initialized inside the web service process.
- The single Render web service runs **both** the Express API and the BullMQ background worker concurrently.
- If you scale to multiple container instances or a standalone worker later (`npm run worker`), BullMQ’s distributed Redis locking seamlessly balances jobs across instances without duplicate dispatch risk.

---

## 7. Ethereal Email Configuration

The mailer supports two modes:

### Mode A: Zero-Config Auto Mode (Default)
Leave `ETHEREAL_USER` and `ETHEREAL_PASSWORD` blank.
- Nodemailer dynamically generates an ephemeral test account at boot.
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

## 8. Keepalive Cron Configuration (Preventing Cold Starts)

Render free instances spin down after 15 minutes of inactivity.

To keep the instance permanently warm for reviewer evaluations:
1. Use a free monitoring service like [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com).
2. Target: `https://preach-inbox-api.onrender.com/health` (or `https://preach-inbox-api.onrender.com/`).
3. Method: `GET`.
4. Interval: **Every 10 to 14 minutes**.

### Policy & Quota Considerations:
- **Zero Risk of Account Suspension**: Uptime monitors and pingers are standard developer practices. Render does not suspend accounts for uptime pinging.
- **750 Free Instance Hours Limit**: Render provides 750 free instance hours per calendar month per account. A single service running continuously 24/7 consumes $24 \times 31 = 744$ hours, which stays safely within the 750-hour allowance.

---

## 9. Elasticsearch Resilience & Circuit Breaker

### Technical Analysis:
Running local Elasticsearch inside small free-tier containers (0.1 CPU / 512 MB RAM) is unstable:
1. **JVM Memory Requirements**: JVM Metaspace and Lucene page cache require at least 800MB–1.2GB. Low-memory containers suffer Linux OOM Killer kills (`SIGKILL / Exit 137`).
2. **CPU Throttling**: JVM JIT compilation on 100 millicores takes several minutes to boot.

### Our Solution:
Our codebase is connected to an Elastic Cloud 9.x cluster and includes an automatic circuit breaker:
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
If the external cluster is unavailable or network latency spikes, the system automatically routes all search requests to PostgreSQL with zero user impact.

---

## 10. Verification Scripts

Run the included verification scripts inside `backend/src/scripts/`:

```bash
cd backend

# 1. Test direct SMTP delivery to Ethereal
npx tsx src/scripts/test-ethereal.ts

# 2. Test full end-to-end flow: DB -> BullMQ Delayed Queue -> Worker -> Ethereal
npx tsx src/scripts/test-end-to-end-email.ts

# 3. Test Elasticsearch connectivity & search query execution
npx tsx src/scripts/test-elasticsearch.ts
```
