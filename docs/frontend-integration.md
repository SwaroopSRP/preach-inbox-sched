# Frontend Integration Guide

This guide provides frontend engineers with everything needed to build a React, Next.js, or Vue client on top of the **PreachInbox Sched** API.

---

## 1. Quick Setup & Environment Configuration

### API Base URLs
| Environment | Base URL |
| :--- | :--- |
| **Local Development** | `http://localhost:3000` |
| **Production (Render)** | `https://preach-inbox-api.onrender.com` |

### Environment Variables
Configure your frontend `.env` file:
```env
# Vite
VITE_API_URL=http://localhost:3000

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Critical: Cookie Credentials
The backend uses secure, `HttpOnly` JWT cookies named `token`. **Every HTTP request must include credentials**:
- If using `axios`: Set `withCredentials: true`.
- If using `fetch()`: Set `credentials: 'include'`.

> [!WARNING]
> Failing to set `withCredentials: true` or `credentials: 'include'` will cause all protected endpoints (`/api/auth/me`, `/api/emails/*`, `/api/senders`) to return an HTTP `401 Unauthorized` response.

---

## 2. Complete TypeScript Type Definitions

Save this file as `src/types/api.ts` in your frontend project:

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
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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
  updatedAt: string;
  sender?: {
    id: string;
    email: string;
    name: string;
  };
}

export interface ScheduleEmailPayload {
  senderId: string;
  recipients: string | string[]; // Can pass single string or array of emails
  subject: string;
  body: string;
  scheduledAt: string;           // ISO 8601 string: e.g. new Date().toISOString()
  delayMs?: number;              // Optional: minimum 2000 (defaults to 2000)
  hourlyLimit?: number;          // Optional: defaults to 200
}

export interface ScheduleEmailResponse {
  message: string;
  emails: Email[];
}

export interface SearchEmailsResponse {
  source: 'elasticsearch' | 'postgres_fallback';
  count: number;
  emails: Email[];
}

export interface SlackStatus {
  connected: boolean;
  teamName?: string | null;
  channelName?: string | null;
  createdAt?: string | null;
}

export interface SystemHealth {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  uptime: number;
  connections: {
    redis: { status: string; latencyMs: number | null };
    database: { status: string; latencyMs: number | null };
    bullmq: { status: string; worker: string };
    elasticsearch: { status: string; latencyMs?: number; version?: string };
  };
}

export interface ApiErrorDetail {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  error: string;
  details?: ApiErrorDetail[];
}
```

---

## 3. Production API Client Setup

Create `src/lib/api.ts`:

```typescript
import axios from 'axios';

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3000';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // CRITICAL: Sends and receives HTTP-only cookies
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Response interceptor for unified error formatting
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorData = error.response?.data;
    const message = errorData?.error || error.message || 'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);
```

---

## 4. Authentication Flow & React Hooks

### Flow Diagram
```text
1. User clicks "Sign in with Google"
   └──► window.location.href = `${API_URL}/auth/google`

2. Google Consent Screen (scopes: openid, email, profile)
   └──► User approves

3. Google redirects to backend callback:
   └──► GET /api/auth/google/callback?code=...
   └──► Backend creates/updates User in PostgreSQL
   └──► Backend sets HTTP-only 'token' cookie
   └──► Backend redirects to ${FRONTEND_URL}/dashboard

4. Frontend on mount calls GET /api/auth/me
   ├── If 200 OK: Loads user profile into state
   └── If 401 Unauthorized: Redirects to /login
```

> [!NOTE]
> **Browser Extension Notice**: Privacy extensions like *ClearURLs* strip Google query parameters (`part`, `rapt`, `xsrf`), which triggers a Google 400 Bad Request error. Disable or whitelist `accounts.google.com`.

### Development Login Bypass
To develop or test without signing in through Google:
- Frontend can call: `GET /api/auth/dev-login?email=test@example.com&name=TestUser`
- Instantly sets the authentication cookie.

### Complete `useAuth()` Hook
Save as `src/hooks/useAuth.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { User } from '../types/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await api.get<{ user: User }>('/api/auth/me');
      setUser(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loginWithGoogle = () => {
    window.location.href = `${api.defaults.baseURL}/auth/google`;
  };

  const devLogin = async (email = 'srp31.swaroop@gmail.com', name = 'Swaroop (Dev)') => {
    setLoading(true);
    try {
      const res = await api.get<{ user: User }>(`/api/auth/dev-login?format=json&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`);
      setUser(res.data.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  return {
    user,
    loading,
    isAuthenticated: !!user,
    loginWithGoogle,
    devLogin,
    logout,
    refreshUser: checkAuth,
  };
}
```

---

## 5. Email Management & Scheduling Hooks

### Complete `useEmails()` Hook
Save as `src/hooks/useEmails.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Email, ScheduleEmailPayload, ScheduleEmailResponse } from '../types/api';

export function useEmails() {
  const [scheduledEmails, setScheduledEmails] = useState<Email[]>([]);
  const [sentEmails, setSentEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduledRes, sentRes] = await Promise.all([
        api.get<{ emails: Email[] }>('/api/emails/scheduled'),
        api.get<{ emails: Email[] }>('/api/emails/sent'),
      ]);
      setScheduledEmails(scheduledRes.data.emails);
      setSentEmails(sentRes.data.emails);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const scheduleBatch = async (payload: ScheduleEmailPayload): Promise<ScheduleEmailResponse> => {
    const res = await api.post<ScheduleEmailResponse>('/api/emails/schedule', payload);
    await fetchEmails(); // Refresh lists
    return res.data;
  };

  return {
    scheduledEmails,
    sentEmails,
    loading,
    error,
    refresh: fetchEmails,
    scheduleBatch,
  };
}
```

---

## 6. Sender Management Hook

### Complete `useSenders()` Hook
Save as `src/hooks/useSenders.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Sender } from '../types/api';

export function useSenders() {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSenders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ senders: Sender[] }>('/api/senders');
      setSenders(res.data.senders);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSenders();
  }, [fetchSenders]);

  const createSender = async (name: string, email: string) => {
    const res = await api.post<{ sender: Sender }>('/api/senders', { name, email });
    setSenders((prev) => [...prev, res.data.sender]);
    return res.data.sender;
  };

  return { senders, loading, createSender, refreshSenders: fetchSenders };
}
```

---

## 7. Real-Time Search with Debouncing

Search queries query Elasticsearch first and automatically fall back to PostgreSQL.

### Complete `useEmailSearch()` Hook
Save as `src/hooks/useEmailSearch.ts`:

```typescript
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Email, SearchEmailsResponse } from '../types/api';

export function useEmailSearch(query: string, debounceMs = 300) {
  const [results, setResults] = useState<Email[]>([]);
  const [source, setSource] = useState<'elasticsearch' | 'postgres_fallback' | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSource(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<SearchEmailsResponse>(
          `/api/emails/search?q=${encodeURIComponent(query.trim())}`
        );
        setResults(res.data.emails);
        setSource(res.data.source);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [query, debounceMs]);

  return { results, source, loading };
}
```

---

## 8. CSV Parsing & Upload Helper

Users can schedule thousands of emails by uploading a CSV. This helper extracts, validates, and deduplicates emails directly in the browser before sending:

Save as `src/utils/csv.ts`:

```typescript
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export interface CsvParseResult {
  validEmails: string[];
  invalidCount: number;
  totalCount: number;
}

export function parseRecipientCsv(fileContent: string): CsvParseResult {
  const lines = fileContent.split(/[\r\n,]+/);
  const validSet = new Set<string>();
  let invalidCount = 0;

  for (const raw of lines) {
    const trimmed = raw.trim().replace(/^["']|["']$/g, '');
    if (!trimmed) continue;

    if (EMAIL_REGEX.test(trimmed)) {
      validSet.add(trimmed.toLowerCase());
    } else {
      invalidCount++;
    }
  }

  const validEmails = Array.from(validSet);
  return {
    validEmails,
    invalidCount,
    totalCount: validEmails.length + invalidCount,
  };
}
```

---

## 9. Slack Alerts Integration Hook

Save as `src/hooks/useSlack.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { SlackStatus } from '../types/api';

export function useSlack() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SlackStatus>('/api/integrations/slack/status');
      setStatus(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const connect = () => {
    window.location.href = `${api.defaults.baseURL}/api/integrations/slack/connect`;
  };

  const disconnect = async () => {
    await api.post('/api/integrations/slack/disconnect');
    setStatus({ connected: false });
  };

  return { status, loading, connect, disconnect, refreshStatus: fetchStatus };
}
```

---

## 10. Dashboard UI Layout & Wireframe Blueprint

Frontend developers can follow this structural layout for high usability:

```text
+-------------------------------------------------------------------------+
| [Logo] PreachInbox Sched     [Search Input (q)]     [Health: OK] [Avatar]
+-------------------------------------------------------------------------+
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Actions: [+ Schedule Email]   [+ Add Sender]   [Slack: Connected] |  |
|  +-------------------------------------------------------------------+  |
|                                                                         |
|  [ Scheduled Emails (23) ]        [ Sent Emails (1,240) ]               |
|  +-------------------------------------------------------------------+  |
|  | Recipient         | Subject          | Sender     | Scheduled At  |  |
|  |-------------------+------------------+------------+---------------|  |
|  | alex@company.com  | Q3 Introduction  | Outreach   | In 12 minutes |  |
|  | sam@acme.org      | Demo Follow-up   | Sales Team | Tomorrow 9 AM |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### Compose Modal Fields:
1. **Sender Identity**: Dropdown populated via `useSenders()`.
2. **Recipients**:
   - Tag input for typing individual email addresses.
   - Drag-and-drop CSV file dropzone triggering `parseRecipientCsv()`. Shows preview badge: `✓ 450 valid recipients parsed`.
3. **Subject**: Text input (`min 1 char`).
4. **Body**: Multi-line textarea or rich text editor.
5. **Scheduled Time**:
   - "Send Now" button (sets `scheduledAt = new Date().toISOString()`).
   - "Schedule for Later" datetime picker (converts local selection to UTC ISO string: `date.toISOString()`).
6. **Submit**: Calls `scheduleBatch({ senderId, recipients, subject, body, scheduledAt })`.
