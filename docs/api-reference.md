# Complete API Reference

Base URLs:
- **Local Development**: `http://localhost:3000`
- **Production (Render)**: `https://preach-inbox-api.onrender.com`

---

## Table of Contents
1. [Authentication & Headers](#1-authentication--headers)
2. [System & Health Endpoints](#2-system--health-endpoints)
3. [Authentication Endpoints](#3-authentication-endpoints)
4. [Sender Management Endpoints](#4-sender-management-endpoints)
5. [Email Scheduling & Retrieval Endpoints](#5-email-scheduling--retrieval-endpoints)
6. [Slack Integration Endpoints](#6-slack-integration-endpoints)
7. [Bull Board Admin Dashboard](#7-bull-board-admin-dashboard)
8. [Standard Error Format](#8-standard-error-format)

---

## 1. Authentication & Headers

All protected endpoints require authentication. The backend supports two methods:

1. **HTTP-Only Cookie** (Recommended for web browsers):
   ```http
   Cookie: token=<jwt_token>
   ```
2. **Authorization Header** (Recommended for API clients / mobile / curl):
   ```http
   Authorization: Bearer <jwt_token>
   ```

*Note for local unit testing: If `NODE_ENV === 'test'`, passing header `x-user-id: <user_id>` automatically impersonates that user.*

---

## 2. System & Health Endpoints

### `GET /health` and `GET /`
Returns real-time operational status of the service, uptime, and live probe latencies for Redis, Database (PostgreSQL), and BullMQ.
- **Auth Required**: **None** (unrestricted, zero rate limits, ideal for keepalive cron jobs).
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "service": "preach-inbox-sched-backend",
    "timestamp": "2026-09-05T14:24:59.029Z",
    "uptime": 1629.24,
    "connections": {
      "redis": {
        "status": "connected",
        "latencyMs": 2
      },
      "database": {
        "status": "connected",
        "latencyMs": 48
      },
      "bullmq": {
        "status": "ready",
        "worker": "active"
      }
    }
  }
  ```

---

## 3. Authentication Endpoints

### `GET /auth/google` (or `/api/auth/google`)
Initiates Google OAuth 2.0 authentication.
- **Auth Required**: None.
- **HTTP Method**: `GET`
- **Response**: `302 Found` (redirects to `https://accounts.google.com/o/oauth2/v2/auth`).

### `GET /api/auth/google/callback`
Google OAuth redirect callback. Exchanges code for tokens, provisions or updates the user record, provisions a default sender, and sets an HTTP-only JWT cookie.
- **Auth Required**: None.
- **Query Parameters**:
  - `code` (string, required): Authorization code from Google.
- **Response**: `302 Found` (redirects to `${FRONTEND_URL}/dashboard`).
  - Sets cookie: `token=<jwt>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`.

### `GET /api/auth/me`
Retrieves profile information for the currently authenticated user.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "c7a8b412-89dc-4c2b-93e1-0b8923a10931",
      "email": "user@example.com",
      "name": "Jane Doe",
      "avatar": "https://lh3.googleusercontent.com/a/..."
    }
  }
  ```

### `POST /api/auth/logout`
Logs out the user and clears the authentication cookie.
- **Auth Required**: None.
- **HTTP Method**: `POST`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

---

## 4. Sender Management Endpoints

### `GET /api/senders`
Lists all verified sender identities created by or assigned to the authenticated user.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "senders": [
      {
        "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "email": "sales@company.com",
        "name": "Acme Sales Team",
        "createdAt": "2026-09-04T15:00:00.000Z"
      }
    ]
  }
  ```

### `POST /api/senders`
Creates a new sender identity for the authenticated user.
- **Auth Required**: Yes.
- **HTTP Method**: `POST`
- **Request Body**:
  ```json
  {
    "email": "outreach@company.com",
    "name": "Outreach Team"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "sender": {
      "id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
      "userId": "c7a8b412-89dc-4c2b-93e1-0b8923a10931",
      "email": "outreach@company.com",
      "name": "Outreach Team",
      "createdAt": "2026-09-05T14:30:00.000Z",
      "updatedAt": "2026-09-05T14:30:00.000Z"
    }
  }
  ```

---

## 5. Email Scheduling & Retrieval Endpoints

### `POST /api/emails/schedule`
Schedules one or many emails (supports single compose and batch/CSV imports).
- **Auth Required**: Yes.
- **HTTP Method**: `POST`
- **Request Body**:
  ```json
  {
    "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
    "recipients": [
      "lead1@enterprise.com",
      "lead2@enterprise.com"
    ],
    "subject": "Q3 Growth Partnership",
    "body": "Hi there,\n\nI would love to connect regarding Q3 growth.",
    "scheduledAt": "2026-09-05T15:00:00.000Z",
    "delayMs": 2000
  }
  ```
- **Field Constraints**:
  - `senderId` (UUID, required): Must belong to the authenticated user.
  - `recipients` (Array of emails, 1 to 5,000 items): Valid email addresses.
  - `subject` (string, 1 to 255 chars).
  - `body` (string, min 1 char).
  - `scheduledAt` (ISO 8601 string): Scheduled dispatch time.
  - `delayMs` (integer, optional, defaults to system min 2000ms): Inter-email delay.
- **Response `201 Created`**:
  ```json
  {
    "message": "Successfully scheduled 2 email(s)",
    "count": 2,
    "emails": [
      {
        "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
        "userId": "c7a8b412-89dc-4c2b-93e1-0b8923a10931",
        "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "recipient": "lead1@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there...",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-05T15:00:00.000Z",
        "sentAt": null,
        "failedAt": null,
        "errorMessage": null,
        "createdAt": "2026-09-05T14:55:00.000Z"
      }
    ]
  }
  ```

### `GET /api/emails/scheduled`
Retrieves all scheduled (pending) emails for the current user, ordered by `scheduledAt ASC`.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "emails": [
      {
        "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
        "recipient": "lead1@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there...",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-05T15:00:00.000Z",
        "sender": {
          "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
          "email": "sales@company.com",
          "name": "Acme Sales Team"
        }
      }
    ]
  }
  ```

### `GET /api/emails/sent`
Retrieves all successfully delivered emails for the current user, ordered by `sentAt DESC`.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "emails": [
      {
        "id": "c35d22f3-4f70-4fe3-9ed1-3a0bcc49fae1",
        "recipient": "client@acme.com",
        "subject": "Onboarding Complete",
        "status": "SENT",
        "sentAt": "2026-09-05T14:26:36.962Z",
        "sender": {
          "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
          "email": "sales@company.com",
          "name": "Acme Sales Team"
        }
      }
    ]
  }
  ```

### `GET /api/emails/:id`
Retrieves full details of a specific email by ID.
- **Auth Required**: Yes (enforces user ownership).
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "email": {
      "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
      "recipient": "lead1@enterprise.com",
      "subject": "Q3 Growth Partnership",
      "body": "Hi there...",
      "status": "SCHEDULED",
      "scheduledAt": "2026-09-05T15:00:00.000Z",
      "sentAt": null,
      "sender": {
        "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "email": "sales@company.com",
        "name": "Acme Sales Team"
      }
    }
  }
  ```

### `GET /api/emails/search?q=<query>`
Free-text multi-match search across `recipient`, `subject`, and `body` with user data isolation.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `q` (string, required): Search keyword (e.g. `partnership`, `john.doe`, `revenue`).
- **Response `200 OK` (Elasticsearch Active)**:
  ```json
  {
    "source": "elasticsearch",
    "count": 1,
    "emails": [...]
  }
  ```
- **Response `200 OK` (PostgreSQL Fallback Active)**:
  ```json
  {
    "source": "postgres_fallback",
    "count": 1,
    "emails": [...]
  }
  ```

---

## 6. Slack Integration Endpoints

### `GET /api/integrations/slack/connect`
Initiates Slack OAuth 2.0 installation.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response**: `302 Found` (redirects to `https://slack.com/oauth/v2/authorize`).

### `GET /api/integrations/slack/callback`
Slack OAuth redirect handler. Exchanges `code` for an incoming webhook and access token, then persists it to `SlackConnection`.
- **Auth Required**: None (uses signed OAuth state parameter).
- **Response**: `302 Found` (redirects to `${FRONTEND_URL}/settings?slack=connected`).

### `GET /api/integrations/slack/status`
Checks if the current user has an active Slack workspace connection.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "connected": true,
    "teamName": "Acme Workspace",
    "channelName": "#email-alerts"
  }
  ```

### `POST /api/integrations/slack/disconnect`
Disconnects and removes the Slack connection for the authenticated user.
- **Auth Required**: Yes.
- **HTTP Method**: `POST`
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Slack integration disconnected successfully"
  }
  ```

---

## 7. Bull Board Admin Dashboard

### `GET /admin/queues`
Interactive visual dashboard powered by `@bull-board/express`.
- **URL**: `https://preach-inbox-api.onrender.com/admin/queues/`
- **Features**:
  - Real-time job counts across statuses: `Active`, `Delayed`, `Waiting`, `Completed`, `Failed`.
  - Full inspection of job data, stack traces, and attempt counts.
  - Manual retry and clean triggers.

---

## 8. Standard Error Format

All error responses return a standardized JSON structure:

```json
{
  "error": "Error message description",
  "details": [
    {
      "path": "recipients.0",
      "message": "Each recipient must be a valid email"
    }
  ]
}
```

### Common Status Codes
- `400 Bad Request`: Input validation failed (Zod validation error).
- `401 Unauthorized`: Missing or invalid JWT session token.
- `404 Not Found`: Requested resource (email or sender) not found or not owned by user.
- `409 Conflict`: Duplicate entry (e.g. sender email already exists for user).
- `500 Internal Server Error`: Unhandled server exception.
