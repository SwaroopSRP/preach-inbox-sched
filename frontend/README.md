# PreachInbox Frontend Dashboard

Production-grade email outreach and scheduling client built with **React**, **TypeScript**, **Vite**, and **Tailwind CSS**, designed to pixel-perfect fidelity against ReachInbox Figma mockups.

---

## Features & Screens

### 1. Authentication (`LoginView`)
- Real **Google OAuth 2.0** flow (`/api/auth/google`).
- Traditional Email + Password login and user registration (`/api/auth/login`, `/api/auth/register`).
- **Dev Login Bypass** for instant local testing without needing external Google credentials.

### 2. Main Dashboard & Navigation
- **Left Sidebar**:
  - `ONB` brand typography logo.
  - Active User Profile card with avatar, name, and email.
  - User settings dropdown: Settings & Preferences, BullMQ live dashboard link, and Sign Out.
  - Green outlined **Compose** pill button.
  - **CORE** Navigation:
    - **Scheduled**: Clock icon, live count badge, orange scheduled badges.
    - **Sent**: Paper airplane icon, live count badge, sent status badges.
- **Top Header Bar**:
  - Rounded search input with search icon, live debounce query against Elasticsearch / PostgreSQL fallback (`/api/emails/search?q=...`), clear button.
  - Filter and Refresh action buttons with spin micro-animation.

### 3. Email List & Mailbox Feed
- **Scheduled View**: Recipient, peach/orange scheduled badge with clock icon (e.g. `🕒 Tue 9:15:12 AM`), subject, body snippet, star action.
- **Sent View**: Recipient, sent pill badge (`Sent`), subject, body snippet, star action.
- Loading skeletons and empty states with compose action button.
- Clicking any email transitions directly into the full Email Thread View.

### 4. Email Thread / Detail View
- Back button to inbox, subject title, Star, Archive, and Delete action buttons.
- Sender circular avatar, name, `<sender@example.com>`, "to me" dropdown, formatted timestamp.
- Rich rendered body with highlighted callout banner (⚡ lightning bolt styling matching Figma).
- Attached media cards (thumbnail preview, filename, file size, download icon).

### 5. Compose New Email & Send Later Modal
- **From**: Dropdown selector with verified sender identities from `/api/senders`.
- **To**: Recipient email input + **Upload List** CSV / text file lead importer:
  - Parses emails from files, eliminates duplicates, and displays green pill tags (`tame@jmail.com`, `lame@jmail.com`, `+4` count badge).
- **Subject**: Email subject line input.
- **Throttling Controls**: "Delay between 2 emails" (`delayMs`, minimum 2s) and "Hourly Limit" (`hourlyLimit`, default 200).
- **Rich Text Editor Toolbar**: Undo, Redo, Bold, Italic, Underline, Strikethrough, Alignment, Lists, Quote, Link.
- **"Send Later" Popover**:
  - Date & time picker.
  - Quick chips: "Tomorrow", "Tomorrow, 10:00 AM", "Tomorrow, 11:00 AM", "Tomorrow, 3:00 PM".
  - Cancel & Done buttons (switches primary button to "Send Later").

### 6. Settings & Integrations Modal
- **Theme Options**: Light, Dark, System default with instant persistence in `localStorage`.
- **Slack Alert Integration**: Live connection status, workspace & channel name, Connect Slack OAuth trigger, and Disconnect button.
- **Sender Identities**: List and add new verified sender identities.
- **BullMQ Queues**: Direct link to open Bull Board admin queues (`/admin/queues`).

---

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(In local development, `VITE_API_URL` can be left blank because the Vite dev server proxies `/api` and `/auth` to `http://localhost:3000` automatically).*

### 3. Start Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Production Build

To test and compile the production bundle:
```bash
npm run build
```
Build output will be generated in `dist/`.

---

## Vercel Deployment

Deploying to Vercel is seamless:
1. Import the repository in [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Set Environment Variable: `VITE_API_URL=https://preach-inbox-api.onrender.com`.
4. Deploy! Single-page app routing is managed by `vercel.json`.
