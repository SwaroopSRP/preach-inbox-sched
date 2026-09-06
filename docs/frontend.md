# Frontend Architecture & Application Guide

This document provides a comprehensive engineering guide to the **PreachInbox Sched** frontend web client.

---

## 1. Overview & Aesthetic System

The PreachInbox frontend is a high-performance, single-page application built to match the ReachInbox Figma specification with an **obsidian-dark aesthetic**, responsive layouts, micro-animations, and complete real-time integration with the backend scheduling engine.

### Design Tokens & Aesthetics
- **Theme Modes**: Full support for Dark (Obsidian default), Light, and System preferences.
- **Color Palette**:
  - Background: Deep obsidian (`#0f1117` / `#161922` surface levels)
  - Primary Accent: Indigo / Brand Blue (`#4f46e5` / `#6366f1`)
  - Status Indicators:
    - `SCHEDULED`: Warm peach/amber badge with live countdown (`🕒 Tue 9:15 AM`)
    - `SENT`: Emerald green pill badge (`✓ Sent`)
    - `FAILED`: Rose red badge with error tooltip
- **Typography & Icons**: Clean, modern sans-serif typography with feather-weight Lucide icons.

---

## 2. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [React 18](https://react.dev/) | Component architecture & reactive UI state |
| **Build Tool** | [Vite 5](https://vitejs.dev/) | Lightning-fast HMR and optimized production bundles |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) | Strict type safety matching backend Prisma & DTO models |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com/) | Curated utility design system with custom dark mode classes |
| **HTTP Client** | [Axios](https://axios-http.com/) | Unified REST client with automatic `withCredentials: true` cookie handling |
| **Icons** | [Lucide React](https://lucide.dev/) | Consistent, lightweight iconography |

---

## 3. Directory & Component Structure

```text
frontend/
├── public/                     # Static assets & favicon
├── src/
│   ├── assets/                 # SVGs and branding logos
│   ├── components/
│   │   ├── auth/
│   │   │   └── LoginView.tsx   # Google OAuth, Email/Password & Dev Bypass screen
│   │   ├── compose/
│   │   │   └── ComposeModal.tsx# Rich email composer, CSV importer & Send Later modal
│   │   ├── inbox/
│   │   │   ├── EmailDetail.tsx # Email inspection, raw headers & action toolbar
│   │   │   └── EmailList.tsx   # Scheduled and Sent mailbox feed tables
│   │   ├── layout/
│   │   │   ├── Header.tsx      # Dual search bar, Star filter, theme toggle & avatar
│   │   │   └── Sidebar.tsx     # Navigation (OneBox, Scheduled, Sent, Preferences)
│   │   └── settings/
│   │       └── PreferencesDrawer.tsx # Slide-in drawer for Slack, BullMQ & Senders
│   ├── context/                # Theme and global state providers
│   ├── services/
│   │   └── api.ts              # Axios instance, endpoints & error interceptors
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces (User, Email, Sender, Slack)
│   ├── App.tsx                 # Core layout, tab routing & reactive email polling
│   ├── index.css               # Tailwind directives & custom scrollbars
│   └── main.tsx                # React DOM root entrypoint
├── .env.example                # Template for environment variables
├── tailwind.config.js          # Extended dark colors & animations
├── vercel.json                 # Vercel SPA routing rewrite rules
└── vite.config.ts              # Dev server proxy configuration
```

---

## 4. Core Features & Implementation Details

### 1. Modern Authentication (`LoginView.tsx`)
- **Google OAuth 2.0 OpenID Connect**:
  - Clicking **"Sign in with Google"** redirects to `${API_URL}/auth/google` with scopes `openid`, `email`, `profile`.
  - The backend issues a secure, `HttpOnly; SameSite=Lax` cookie and renders a matching branded confirmation screen before redirecting into the dashboard.
- **1-Click Dev Bypass**:
  - Built-in developer button (`Dev Login Bypass`) calls `/api/auth/dev-login` to instantly provision a test user and sender without needing Google Cloud credentials.
- **Email + Password**:
  - Built-in registration (`/api/auth/register`) and login (`/api/auth/login`) forms with real-time error handling.
- **Session Verification**:
  - `App.tsx` queries `GET /api/auth/me` on startup. If valid, the dashboard loads; if 401, the user sees `LoginView`.

### 2. Dual Mailbox Feeds & Filtering (`EmailList.tsx`, `Header.tsx`)
- **Scheduled Feed**:
  - Displays emails queued for future dispatch.
  - Features peach/amber countdown pill (e.g. `🕒 In 5m` or `🕒 Tomorrow 10:00 AM`).
  - Displays recipient chips, subject line, snippet preview, and star toggle.
- **Sent Feed**:
  - Displays emails that have successfully passed through BullMQ and Nodemailer Ethereal SMTP.
  - Displays emerald `✓ Sent` pill badge and dispatch timestamp.
- **Star Filter**:
  - Star states are persisted across page reloads via `localStorage`.
  - Header filter menu toggles between **All emails** and **Starred only**.
- **Email Detail Inspector (`EmailDetail.tsx`)**:
  - Displays full sender identity, recipient list, scheduled/sent timestamp, and raw message body.
  - Quick action toolbar: Star, Delete, and direct link to view the delivered email in Ethereal web sandbox.

### 3. Rich Compose & "Send Later" Engine (`ComposeModal.tsx`)
- **Sender Identity Selector**:
  - Dynamically populated dropdown from `GET /api/senders`.
- **Bulk CSV / TXT Lead Importer**:
  - Drag-and-drop or file picker for CSV or plain text lead lists.
  - Automatically parses text, isolates valid email addresses via regex, eliminates duplicates, and displays recipient pill chips.
- **Rich Text Formatting Toolbar**:
  - Bold, Italic, Underline, Strikethrough, Text Alignments, Lists, Quote, and Hyperlink insertion.
- **Granular Dispatch Controls**:
  - Minimum delay between emails (`delayMs`, default `2000`ms).
  - Hourly rate-limit ceiling per sender (`hourlyLimit`, default `200`/hr).
- **"Send Later" Popover**:
  - Date & Time picker for precise scheduling down to the minute.
  - One-click quick presets:
    - `Tomorrow 10:00 AM`
    - `Tomorrow 11:00 AM`
    - `Tomorrow 3:00 PM`
    - `Custom DateTime`
  - Clicking **"Send"** (without scheduling) defaults to an immediate delay (+5s) for smooth queue processing.

### 4. Dual-Layer Real-Time Search (`Header.tsx`, `EmailList.tsx`)
1. **Instant Client-Side Filtering**:
   - Matches keystrokes in real time against in-memory records (recipient, subject, body, sender) for zero-latency UI response.
2. **Debounced Backend Search**:
   - Debounces queries by 250ms and queries `GET /api/emails/search?q=...`.
   - Backend queries Elasticsearch 9.x with multi-match indexing and automatically falls back to PostgreSQL `ILIKE` pattern matching if Elasticsearch is offline.

### 5. Preferences Slide-in Drawer (`PreferencesDrawer.tsx`)
Accessible via the settings gear icon on the sidebar:
- **Slack Quota Alerting**:
  - Connects Slack workspace via Slack OAuth 2.0 (`/api/integrations/slack`).
  - Shows live workspace and channel connection status.
  - Disconnect button to revoke credentials.
- **BullMQ Queue Monitoring**:
  - **Open BullMQ Dashboard ↗**: Directly launches the backend Bull Board UI (`${VITE_API_URL}/admin/queues`), providing visual visibility into active, delayed, completed, and failed jobs.
- **Ethereal Test Senders Sandbox**:
  - One-click generation of new Ethereal SMTP test sender accounts.
  - Lists all provisioned senders with avatar badges.
  - **View inbox ↗** link takes you directly to [ethereal.email](https://ethereal.email) to inspect sent emails.
  - Delete sender capability.
- **Theme Switcher**:
  - Instant toggle between Dark, Light, and System themes with zero-flash CSS application.

---

## 5. Environment Variables & Configuration

The frontend uses Vite environment variables prefixed with `VITE_`:

| Variable | Description | Local Development | Production (Vercel) |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Base URL of the backend API | *(empty - uses Vite proxy)* | `https://preach-inbox-api.onrender.com` |
| `VITE_FRONTEND_URL` | Base URL of the frontend application | `http://localhost:5173` | `https://your-app.vercel.app` |

### How Routing Works
- **In Local Development**: Leaving `VITE_API_URL` empty routes API calls to relative paths (`/api/*`, `/auth/*`, `/admin/*`). `vite.config.ts` automatically proxies these requests to `http://localhost:3000`.
- **In Production (Vercel)**: `VITE_API_URL` directs Axios calls directly to the Render cloud backend, and `VITE_FRONTEND_URL` informs OAuth handlers where to redirect the user after Google login.

---

## 6. Local Setup & Execution

### Prerequisites
- Node.js >= 20
- Running backend API on `http://localhost:3000` (see [Running the Backend](../backend/README.md))

### Step-by-Step Instructions
```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Create .env file from template
cp .env.example .env

# 4. Start Vite development server
npm run dev
```

Open [`http://localhost:5173`](http://localhost:5173) in your browser.

### Available Scripts
```bash
# Start Vite development server with HMR
npm run dev

# Run TypeScript compiler and build optimized production bundle
npm run build

# Preview production build locally
npm run preview

# Run Oxlint fast linter
npx oxlint
```

---

## 7. Production Vercel Deployment

Deploying the frontend to Vercel is seamless:

1. Push your repository to GitHub.
2. In [Vercel Dashboard](https://vercel.com), click **Add New... > Project** and select `preach-inbox-sched`.
3. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add Environment Variables:
   ```text
   VITE_API_URL=https://preach-inbox-api.onrender.com
   VITE_FRONTEND_URL=https://your-app.vercel.app
   ```
5. Click **Deploy**. Single-page app routing is preserved by `frontend/vercel.json`:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```
6. In your Render Dashboard for `preach-inbox-api`, verify that `FRONTEND_URL` is set to `https://your-app.vercel.app` to allow CORS cookies.
