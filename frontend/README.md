# PreachInbox Frontend Dashboard

A production-grade, pixel-perfect email scheduling and outreach dashboard built with **React**, **TypeScript**, **Vite**, and **Tailwind CSS**. Designed to match ReachInbox Figma specifications with an obsidian-dark aesthetic, micro-animations, and full end-to-end integration with the PreachInbox BullMQ backend engine.

---

## 📸 Key Features & Architecture

### 1. Modern Authentication (`LoginView` & Google OAuth)
- **Google OAuth 2.0 Integration**: Authenticates via backend `/api/auth/google`.
- **Revamped Landing Experience**: Upon completing Google OAuth, the backend renders a matching obsidian-dark confirmation page displaying:
  - User avatar with fallback initials
  - Verified security pill (`✓ Google OAuth Verified & Session Cookie Set`)
  - Animated redirect banner (`Redirecting to dashboard...` cycling 1, 2, 3 dots)
  - Session verification link (`/api/auth/me`) and fallback manual redirect link
- **Dev Login Quick Bypass**: 1-click bypass for instant local testing without external Google OAuth credentials.
- **Email + Password**: Traditional registration and login options.

### 2. Dual Mailbox Feeds & Filtering
- **Scheduled Feed**:
  - Displays scheduled jobs with peach/orange badge and countdown (e.g. `🕒 Tue 9:15 AM`).
  - Shows recipient, subject, snippet, and toggleable star icon.
- **Sent Feed**:
  - Displays genuinely sent emails retrieved from `/api/emails/sent`.
  - Shows green `Sent` pill badge, genuine message body snippet, and timestamp.
- **Interactive Star Filter**:
  - Filter button in header opens a menu to toggle between **All emails** and **Starred emails**.
  - Persistent star storage via `localStorage` with active badge indicators.
- **Full Email Detail View**:
  - Clean slide view showing genuine sender email, recipient, timestamp, status badge, full body, and action buttons (Star, Archive, Delete).

### 3. Preferences Slide-In Drawer (`PreferencesDrawer`)
Accessible from the bottom of the sidebar navigation. Slides in smoothly from the right:
- **Slack Notifications**:
  - Live workspace connection status and channel display.
  - Connect with Slack button (Slack OAuth) and Disconnect button.
  - Automatically notifies your team on Slack when a sender hits the hourly dispatch limit.
- **BullMQ Queue Monitor**:
  - **Open BullMQ Dashboard ↗**: Directly opens the backend's live Bull Board (`${VITE_API_URL}/admin/queues` or `http://localhost:3000/admin/queues`), NOT the frontend route.
  - Real-time visibility into active, delayed, completed, and failed jobs.
- **Email Senders Sandbox**:
  - Create free Ethereal SMTP test senders on the fly.
  - List of active senders with initial circles.
  - Quick link to **View inbox ↗** on [ethereal.email](https://ethereal.email) to inspect sent emails.
  - Delete sender capability.
- **Appearance Theme**:
  - Light, Dark, and System modes with instant toggle and zero-flash CSS class application.

### 4. Compose Email & Send Later Modal
- **Sender Dropdown**: Dynamically populated from `/api/senders`.
- **Bulk CSV Lead Importer**:
  - Drag-and-drop or file picker for CSV/TXT lead lists.
  - Automatically extracts emails, eliminates duplicates, and displays recipient pill chips.
- **Throttling & Rate-Limit Controls**:
  - Minimum delay between emails (`delayMs`, default 2,000ms).
  - Hourly sending cap per sender (`hourlyLimit`, default 200/hr).
- **Rich Editor Toolbar**: Undo, Redo, Bold, Italic, Underline, Strikethrough, Text Alignments, Lists, Quote, Link.
- **"Send Later" Popover**:
  - Date & time picker.
  - Quick chips: "Tomorrow", "Tomorrow 10:00 AM", "Tomorrow 11:00 AM", "Tomorrow 3:00 PM".

### 5. Instant Real-Time Search
- **Dual-Layer Search**:
  1. Instant client-side filtering across recipient, subject, body, and sender for immediate zero-latency feedback.
  2. Debounced query (250ms) against backend Elasticsearch with automatic PostgreSQL case-insensitive fallback (`/api/emails/search?q=...`).

---

## 🛠️ Environment Variables & Deployment

The frontend is configured to work with environment variables so it can be deployed on **Vercel** with a single click while communicating with a backend deployed on **Render**.

### Variables (`.env` / `.env.example`)

| Variable | Description | Local Default | Production (Vercel) |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Base URL of the backend API | *(empty - uses Vite proxy)* | `https://preach-inbox-api.onrender.com` |
| `VITE_FRONTEND_URL` | Base URL of the frontend app | `http://localhost:5173` | `https://your-app.vercel.app` |

### How It Works
- In **Local Development**: Leaving `VITE_API_URL` empty instructs the frontend to use relative paths (`/api`, `/auth`, `/admin`), which `vite.config.ts` proxies directly to `http://localhost:3000`.
- In **Production (Vercel)**: Setting `VITE_API_URL` routes all Axios API requests, BullMQ links, and Google/Slack OAuth buttons to your Render backend domain. `VITE_FRONTEND_URL` is passed as a `redirect_url` so Google OAuth returns users to your Vercel URL seamlessly.

---

## 🚀 Step-by-Step Vercel Deployment

1. Push your code to your GitHub repository.
2. Log in to [Vercel](https://vercel.com) and click **Add New... > Project**.
3. Select your repository: `preach-inbox-sched`.
4. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Under **Environment Variables**, add:
   ```text
   VITE_API_URL=https://<your-render-backend>.onrender.com
   VITE_FRONTEND_URL=https://<your-vercel-app>.vercel.app
   ```
6. Click **Deploy**! Single-page app routing is managed automatically by `frontend/vercel.json`.
7. In your **Render Dashboard** for the backend service:
   - Set `FRONTEND_URL=https://<your-vercel-app>.vercel.app` (without trailing slash).
   - This configures CORS credentials and OAuth redirect permissions.

---

## 💻 Local Development Commands

```bash
# Install dependencies
npm install

# Start Vite dev server (port 5173)
npm run dev

# TypeScript typecheck & production build
npm run build

# Preview production build locally
npm run preview
```
