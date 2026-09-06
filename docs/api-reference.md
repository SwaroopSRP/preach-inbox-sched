# Complete API Reference

Base URLs:
- **Local Development**: `http://localhost:3000`
- **Production (Render)**: `https://preach-inbox-api.onrender.com`

---

## Table of Contents
1. [Authentication & Session Management](#1-authentication--session-management)
2. [System & Health Endpoints](#2-system--health-endpoints)
3. [Authentication Endpoints](#3-authentication-endpoints)
4. [Sender Management Endpoints](#4-sender-management-endpoints)
5. [Email Scheduling & Retrieval Endpoints](#5-email-scheduling--retrieval-endpoints)
6. [Slack Integration Endpoints](#6-slack-integration-endpoints)
7. [Bull Board Admin Dashboard](#7-bull-board-admin-dashboard)
8. [Standard Error Format & Status Codes](#8-standard-error-format--status-codes)

---

## 1. Authentication & Session Management

All protected endpoints require authentication. The backend supports two methods:

### 1. HTTP-Only Cookie (Standard for Web Clients)
When logging in via Google OAuth or the Dev Login endpoint, the server issues a secure, signed JWT token in an `HttpOnly` cookie named `token`:
```http
Cookie: token=<jwt_token>
```
- **Attributes**: `HttpOnly; Path=/; SameSite=Lax; Max-Age=604800` (7 days)
- **Production**: `Secure` flag is enabled automatically when `NODE_ENV === 'production'`.
- **Frontend Requirement**: Web clients must specify `credentials: 'include'` (in `fetch`) or `withCredentials: true` (in `axios`).

### 2. Authorization Header (API Clients, Mobile, Curl)
Clients may pass the JWT token directly in the standard HTTP authorization header:
```http
Authorization: Bearer <jwt_token>
```

### 3. Test Impersonation Header (Test Environment Only)
When running in automated test mode (`NODE_ENV === 'test'`), passing `x-user-id: <user_uuid>` bypasses JWT decoding and authenticates the request as that user.

---

## 2. System & Health Endpoints

### `GET /health` and `GET /`
Returns real-time operational status of the service, uptime, and live probe latencies for Redis, PostgreSQL, BullMQ, and Elasticsearch.
- **Auth Required**: **None** (unrestricted, zero rate limits, designed for pingers and uptime monitors).
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "service": "preach-inbox-sched-backend",
    "timestamp": "2026-09-06T04:15:00.000Z",
    "uptime": 3612.45,
    "connections": {
      "redis": {
        "status": "connected",
        "latencyMs": 2
      },
      "database": {
        "status": "connected",
        "latencyMs": 18
      },
      "bullmq": {
        "status": "ready",
        "worker": "active"
      },
      "elasticsearch": {
        "status": "connected",
        "latencyMs": 35,
        "version": "9.6.0"
      }
    }
  }
  ```
- **Fallback Status**: If Elasticsearch is unreachable, `connections.elasticsearch.status` reports `"disconnected (postgres fallback active)"` and the API continues operating with zero downtime.

### `GET /privacy-policy`
Publicly accessible HTML Privacy Policy required for Google Cloud OAuth verification and external compliance.
- **Auth Required**: None.
- **HTTP Method**: `GET`
- **Response**: `200 OK` (`Content-Type: text/html; charset=utf-8`).

---

## 3. Authentication Endpoints

### `GET /auth/google` (Alias: `GET /api/auth/google`)
Initiates the Google OAuth 2.0 OpenID Connect authentication flow.
- **Auth Required**: None.
- **HTTP Method**: `GET`
- **Response**: `302 Found` (redirects user to Google OAuth consent screen with scopes `openid`, `email`, `profile`).
- **Cache-Control**: `no-store, no-cache, must-revalidate` (prevents browser caching of the redirect).

### `GET /api/auth/google/callback`
Google OAuth redirect callback. Exchanges the authorization code for Google access/ID tokens, upserts the user profile in PostgreSQL, sets the secure `token` cookie, and completes authentication.
- **Auth Required**: None.
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `code` (string, required): Authorization code provided by Google.
  - `format` (string, optional): Set to `json` for programmatic clients.
- **Responses**:
  - **Standard Browser Request**: Sets `token` cookie and renders a visual authentication success confirmation card with direct navigation links to `/api/auth/me` and `${FRONTEND_URL}/dashboard`.
  - **JSON Client Request** (if `format=json` or `Accept: application/json` is sent):
    ```json
    {
      "user": {
        "id": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "email": "user@example.com",
        "name": "User Name",
        "avatar": "https://lh3.googleusercontent.com/a/..."
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
    }
    ```

### `POST /api/auth/register` (Alias: `POST /auth/register`)
Registers a new user account with traditional email and password, creates an initial default Sender identity, and issues an authenticated session cookie.
- **Auth Required**: None.
- **HTTP Method**: `POST`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!",
    "name": "Jane Doe"
  }
  ```
- **Validation Rules**:
  - `email` (string, required): Valid email address.
  - `password` (string, required): Minimum 6 characters. Hashed via `bcryptjs` (10 rounds).
  - `name` (string, required): Minimum 1 character.
- **Response `201 Created`**:
  - Sets cookie: `token=<jwt>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`.
  ```json
  {
    "message": "Registration successful",
    "user": {
      "id": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
      "email": "user@example.com",
      "name": "Jane Doe",
      "avatar": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```
- **Response `409 Conflict`**: If an account with this email already exists.

### `POST /api/auth/login` (Alias: `POST /auth/login`)
Authenticates an existing user using email and password, issuing an authenticated session cookie.
- **Auth Required**: None.
- **HTTP Method**: `POST`
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response `200 OK`**:
  - Sets cookie: `token=<jwt>; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`.
  ```json
  {
    "message": "Login successful",
    "user": {
      "id": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
      "email": "user@example.com",
      "name": "Jane Doe",
      "avatar": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```
- **Response `401 Unauthorized`**: If password is wrong, email does not exist, or account was created with Google OAuth only.

### `GET /api/auth/dev-login`
Development and testing authentication bypass. Creates or logs into a test user account and sets the JWT session cookie immediately without needing external Google credentials.
- **Auth Required**: None.
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `email` (string, optional, defaults to `srp31.swaroop@gmail.com`).
  - `name` (string, optional, defaults to `Swaroop (Dev)`).
  - `format` (string, optional): Set to `json` to receive JSON response instead of HTML confirmation card.
- **Response `200 OK`** (when `format=json`):
  ```json
  {
    "success": true,
    "user": {
      "id": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
      "email": "srp31.swaroop@gmail.com",
      "name": "Swaroop (Dev)",
      "avatar": "https://lh3.googleusercontent.com/a/default-user"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```

### `GET /api/auth/me`
Retrieves the profile of the currently authenticated user based on the session cookie or Bearer token.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "user": {
      "id": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
      "email": "user@example.com",
      "name": "User Name",
      "avatar": "https://lh3.googleusercontent.com/a/..."
    }
  }
  ```
- **Response `401 Unauthorized`**: If unauthenticated or token is expired/invalid.

### `POST /api/auth/logout`
Logs out the user by clearing the HTTP-only `token` cookie.
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

A sender identity represents a verified "From" email address associated with the user account.

### `GET /api/senders`
Lists all sender identities owned by the authenticated user.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "senders": [
      {
        "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "email": "sales@company.com",
        "name": "Acme Sales Team",
        "createdAt": "2026-09-04T15:00:00.000Z",
        "updatedAt": "2026-09-04T15:00:00.000Z"
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
- **Validation Rules**:
  - `email` (string, required): Must be a valid email format.
  - `name` (string, required): Minimum 1 character.
  - Senders are scoped per-user: A user cannot create duplicate sender emails for their account (`@@unique([userId, email])`).
- **Response `201 Created`**:
  ```json
  {
    "sender": {
      "id": "f81d4fae-7dec-11d0-a765-00a0c91e6bf6",
      "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
      "email": "outreach@company.com",
      "name": "Outreach Team",
      "createdAt": "2026-09-06T04:20:00.000Z",
      "updatedAt": "2026-09-06T04:20:00.000Z"
    }
  }
  ```
- **Response `409 Conflict`**: If a sender with this email already exists for this user.

---

## 5. Email Scheduling & Retrieval Endpoints

### `POST /api/emails/schedule`
Schedules one or many emails for delayed dispatch. Supports both single-recipient compose and large batch / CSV imports.
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
    "body": "Hi there,\n\nWe would love to discuss a partnership.",
    "scheduledAt": "2026-09-06T12:00:00.000Z",
    "delayMs": 2000,
    "hourlyLimit": 200
  }
  ```
- **Field Constraints**:
  - `senderId` (UUID, required): Must be a valid UUID and belong to the authenticated user.
  - `recipients` (string OR array of strings, required): Can be a single email string (`"lead@acme.com"`) or an array of email strings (`["lead1@acme.com", "lead2@acme.com"]`). Automatically transformed into an array.
  - `subject` (string, required): Non-empty string.
  - `body` (string, required): Non-empty string (HTML or plain text).
  - `scheduledAt` (ISO 8601 string, required): Target delivery time.
  - `delayMs` (integer, optional): Inter-email delay spacing in milliseconds. Bounded by system safety minimum `MIN_EMAIL_DELAY_MS` (2000ms).
  - `hourlyLimit` (integer, optional): Hourly sender quota cap (default: 200).
- **Response `201 Created`**:
  ```json
  {
    "message": "Successfully scheduled 2 email(s)",
    "emails": [
      {
        "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
        "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "recipient": "lead1@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there,\n\nWe would love to discuss a partnership.",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-06T12:00:00.000Z",
        "sentAt": null,
        "failedAt": null,
        "errorMessage": null,
        "createdAt": "2026-09-06T04:25:00.000Z",
        "updatedAt": "2026-09-06T04:25:00.000Z"
      },
      {
        "id": "a82b941f-e31c-4b52-9c12-7e48bb912345",
        "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "recipient": "lead2@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there,\n\nWe would love to discuss a partnership.",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-06T12:00:02.000Z",
        "sentAt": null,
        "failedAt": null,
        "errorMessage": null,
        "createdAt": "2026-09-06T04:25:00.000Z",
        "updatedAt": "2026-09-06T04:25:00.000Z"
      }
    ]
  }
  ```

### `GET /api/emails/scheduled`
Retrieves all emails currently in `SCHEDULED` status for the authenticated user, ordered chronologically by `scheduledAt ASC`.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "emails": [
      {
        "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
        "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "recipient": "lead1@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there...",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-06T12:00:00.000Z",
        "sentAt": null,
        "failedAt": null,
        "errorMessage": null,
        "createdAt": "2026-09-06T04:25:00.000Z",
        "updatedAt": "2026-09-06T04:25:00.000Z",
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
Retrieves all emails in `SENT` status for the authenticated user, ordered reverse-chronologically by `sentAt DESC`.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK`**:
  ```json
  {
    "emails": [
      {
        "id": "c35d22f3-4f70-4fe3-9ed1-3a0bcc49fae1",
        "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "recipient": "client@acme.com",
        "subject": "Onboarding Complete",
        "body": "Welcome aboard!",
        "status": "SENT",
        "scheduledAt": "2026-09-06T04:00:00.000Z",
        "sentAt": "2026-09-06T04:00:02.150Z",
        "failedAt": null,
        "errorMessage": null,
        "createdAt": "2026-09-06T03:55:00.000Z",
        "updatedAt": "2026-09-06T04:00:02.150Z",
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
Retrieves full details of a specific email by its UUID.
- **Auth Required**: Yes (enforces user ownership).
- **HTTP Method**: `GET`
- **URL Parameters**:
  - `id` (UUID, required): Email ID.
- **Response `200 OK`**:
  ```json
  {
    "email": {
      "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
      "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
      "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
      "recipient": "lead1@enterprise.com",
      "subject": "Q3 Growth Partnership",
      "body": "Hi there...",
      "status": "SCHEDULED",
      "scheduledAt": "2026-09-06T12:00:00.000Z",
      "sentAt": null,
      "failedAt": null,
      "errorMessage": null,
      "createdAt": "2026-09-06T04:25:00.000Z",
      "updatedAt": "2026-09-06T04:25:00.000Z",
      "sender": {
        "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "email": "sales@company.com",
        "name": "Acme Sales Team"
      }
    }
  }
  ```
- **Response `404 Not Found`**: If the email does not exist or does not belong to the user.

### `GET /api/emails/search?q=<query>`
Multi-match full-text search across `recipient`, `subject`, and `body` fields with multi-tenant user isolation.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `q` (string, required): Search query term (e.g. `partnership`, `acme`, `lead`).
- **Response `200 OK` (Elasticsearch Cluster Active)**:
  ```json
  {
    "source": "elasticsearch",
    "count": 1,
    "emails": [
      {
        "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
        "userId": "3744bfcc-ed08-49d4-a3da-64fc5720da26",
        "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
        "recipient": "lead1@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there...",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-06T12:00:00.000Z",
        "sentAt": null
      }
    ]
  }
  ```
- **Response `200 OK` (PostgreSQL Fallback Active)**:
  If Elasticsearch is unreachable or degraded, the search service automatically trips its circuit breaker and executes a case-insensitive `ILIKE` relational query against PostgreSQL:
  ```json
  {
    "source": "postgres_fallback",
    "count": 1,
    "emails": [
      {
        "id": "dc3a415e-d820-443d-a01b-6f59cc863223",
        "recipient": "lead1@enterprise.com",
        "subject": "Q3 Growth Partnership",
        "body": "Hi there...",
        "status": "SCHEDULED",
        "scheduledAt": "2026-09-06T12:00:00.000Z",
        "sender": {
          "id": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
          "email": "sales@company.com",
          "name": "Acme Sales Team"
        }
      }
    ]
  }
  ```

---

## 6. Slack Integration Endpoints

Integrates with Slack OAuth 2.0 to dispatch automated alerts whenever a sender reaches their hourly rate limit.

### `GET /api/integrations/slack/connect`
Initiates Slack OAuth 2.0 authorization.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response**: `302 Found` (redirects to `https://slack.com/oauth/v2/authorize` with state parameter set to `userId`).

### `GET /api/integrations/slack/callback`
Handles the redirect callback from Slack OAuth. Exchanges the authorization code for a bot token and incoming webhook, and updates the `SlackConnection` record in PostgreSQL.
- **Auth Required**: None (uses signed state parameter).
- **HTTP Method**: `GET`
- **Query Parameters**:
  - `code` (string, required): Authorization code from Slack.
  - `state` (string, required): The user's ID passed during the authorization request.
- **Response**: `302 Found` (redirects to `${FRONTEND_URL}/settings?slack=connected`).

### `GET /api/integrations/slack/status`
Checks if the authenticated user has an active Slack workspace connection.
- **Auth Required**: Yes.
- **HTTP Method**: `GET`
- **Response `200 OK` (Connected)**:
  ```json
  {
    "connected": true,
    "teamName": "Acme Workspace",
    "channelName": "#email-alerts",
    "createdAt": "2026-09-05T18:00:00.000Z"
  }
  ```
- **Response `200 OK` (Not Connected)**:
  ```json
  {
    "connected": false
  }
  ```

### `POST /api/integrations/slack/disconnect`
Removes the Slack connection and revokes further automated rate-limit notifications for the user.
- **Auth Required**: Yes.
- **HTTP Method**: `POST`
- **Response `200 OK`**:
  ```json
  {
    "success": true
  }
  ```

---

## 7. Bull Board Admin Dashboard

### `GET /admin/queues`
Interactive visual queue monitoring dashboard powered by `@bull-board/express`.
- **URL**: `https://preach-inbox-api.onrender.com/admin/queues/`
- **Capabilities**:
  - Live inspection of BullMQ queue state: `Waiting`, `Active`, `Delayed`, `Completed`, `Failed`.
  - Visual inspection of job data payloads (`{ emailId }`), timestamps, and delay timers.
  - Retry failed jobs and inspect error stack traces directly.

---

## 8. Standard Error Format & Status Codes

All errors from the API return a standardized JSON format:

```json
{
  "error": "Validation Error",
  "details": [
    {
      "path": "recipients.0",
      "message": "Each recipient must be a valid email"
    },
    {
      "path": "scheduledAt",
      "message": "scheduledAt must be a valid ISO 8601 string"
    }
  ]
}
```

### HTTP Status Code Summary
| Status Code | Description | Typical Cause |
| :--- | :--- | :--- |
| `200 OK` | Success | Request succeeded and returned data. |
| `201 Created` | Resource Created | Sender or scheduled emails created successfully. |
| `400 Bad Request` | Validation Error | Request body failed Zod validation schema. Check `details` array. |
| `401 Unauthorized` | Not Authenticated | Missing or invalid session cookie / Bearer token. |
| `404 Not Found` | Resource Not Found | Email ID or Sender ID does not exist or belongs to another user. |
| `409 Conflict` | Conflict | Duplicate entry (e.g., creating a sender email that already exists for this user). |
| `500 Internal Server Error` | Server Exception | Unhandled internal server error. |
