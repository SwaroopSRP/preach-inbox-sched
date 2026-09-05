# Frontend Integration Guide

This guide is designed for frontend developers building the user interface on top of the **PreachInbox Sched** backend service.

---

## 1. Quick Setup & Configuration

### Base API URLs
- **Local Dev**: `http://localhost:3000`
- **Production (Render)**: `https://preach-inbox-api.onrender.com`

### Fetch / Axios Setup (Credentials)
Because the backend sets an HTTP-only cookie (`token`) on login, you must include credentials with all HTTP requests:

```typescript
// Axios instance example
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  withCredentials: true, // CRITICAL: ensures cookies are sent & received
});
```

If using native `fetch()`:
```typescript
fetch(`${API_URL}/api/emails/scheduled`, {
  credentials: 'include', // CRITICAL
  headers: { 'Content-Type': 'application/json' },
});
```

---

## 2. TypeScript Data Interfaces

Copy these TypeScript interfaces into your frontend codebase (e.g. `src/types/api.ts`):

```typescript
export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
}

export interface Sender {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Email {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ScheduleEmailPayload {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt: string; // ISO 8601 string: e.g. new Date().toISOString()
  delayMs?: number;    // Minimum 2000 (defaults to 2000)
}

export interface SlackStatus {
  connected: boolean;
  teamName?: string | null;
  channelName?: string | null;
}
```

---

## 3. Implementing the Authentication Flow

```text
[ Login Button Clicked ] ──► Window location = "/auth/google"
                                         │
                                         ▼
                            [ Google Consent Screen ]
                                         │
                                         ▼
                   [ Backend Callback Sets HTTP-Only Cookie ]
                                         │
                                         ▼
                  [ Redirect to Frontend Dashboard /dashboard ]
                                         │
                                         ▼
                        [ Frontend calls GET /api/auth/me ]
                                  /            \
                                 v              v
                       (User Authenticated)   (401 Unauthorized)
                                                Redirect to /login
```

### React Auth Hook Example:
```typescript
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { User } from '../types/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ user: User }>('/api/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loginWithGoogle = () => {
    window.location.href = `${api.defaults.baseURL}/auth/google`;
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    window.location.href = '/login';
  };

  return { user, loading, loginWithGoogle, logout };
}
```

---

## 4. Compose & CSV Upload Implementation

The `POST /api/emails/schedule` endpoint accepts a list of recipients.

### Single vs CSV Batch Compose:
The same API handles both a single recipient and thousands of CSV recipients:

```typescript
import { api } from '../lib/api';
import { ScheduleEmailPayload } from '../types/api';

export async function scheduleEmailBatch(payload: ScheduleEmailPayload) {
  const res = await api.post('/api/emails/schedule', payload);
  return res.data;
}
```

### Parsing CSV Files in Browser:
Use `PapaParse` or a simple string split to extract recipients on the frontend:

```typescript
export function parseRecipientCsv(fileContent: string): string[] {
  return fileContent
    .split(/[\r\n,]+/)
    .map((email) => email.trim())
    .filter((email) => email.includes('@') && email.includes('.'));
}
```

### Payload Example:
```json
{
  "senderId": "e94e71af-7b2a-4e38-87d7-c392dd75fd61",
  "recipients": [
    "lead1@enterprise.com",
    "lead2@enterprise.com",
    "lead3@enterprise.com"
  ],
  "subject": "Partnership Opportunity",
  "body": "Hi there,\n\nWe would love to discuss a partnership.",
  "scheduledAt": "2026-09-06T10:00:00.000Z",
  "delayMs": 2000
}
```

---

## 5. Scheduled & Sent Emails Views

Implement your main view with two tabs:

### 1. "Scheduled" Tab:
- **API Call**: `GET /api/emails/scheduled`
- **Fields to Display**: Recipient, Subject, Sender, Scheduled Time (`scheduledAt`), Status badge (`SCHEDULED`).

### 2. "Sent" Tab:
- **API Call**: `GET /api/emails/sent`
- **Fields to Display**: Recipient, Subject, Sender, Delivery Timestamp (`sentAt`), Status badge (`SENT`).

```typescript
// Example fetch logic
export async function getScheduledEmails() {
  const { data } = await api.get<{ emails: Email[] }>('/api/emails/scheduled');
  return data.emails;
}

export async function getSentEmails() {
  const { data } = await api.get<{ emails: Email[] }>('/api/emails/sent');
  return data.emails;
}
```

---

## 6. Real-Time Search Bar

Implement search using a 300ms debounce:

```typescript
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Email } from '../types/api';

export function useEmailSearch(query: string) {
  const [results, setResults] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get<{ emails: Email[]; source: string }>(
          `/api/emails/search?q=${encodeURIComponent(query)}`
        );
        setResults(data.emails);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  return { results, loading };
}
```

---

## 7. Slack Alert Integration Widget

Display Slack connection status in your user settings:

1. On load, call `GET /api/integrations/slack/status`.
2. If `connected === false`:
   - Display a **"Connect Slack"** button.
   - On click, navigate: `window.location.href = `${api.defaults.baseURL}/api/integrations/slack/connect``.
3. If `connected === true`:
   - Display: **"Connected to [teamName] ([channelName])"**.
   - Display a **"Disconnect"** button which calls `POST /api/integrations/slack/disconnect`.

---

## 8. Error Handling Guidelines

All validation errors from the backend return HTTP 400 with a structured `details` array:

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
      "message": "Scheduled time must be in the future"
    }
  ]
}
```

Map these paths directly to form field error helpers in React!
