# Vercel Deployment & Render Build Isolation Guide

This document outlines how to deploy the PreachInbox frontend to **Vercel**, configure auto-deployments, and ensure **Render** does not rebuild the backend when changes are made to the `frontend/` directory.

---

## 1. Preventing Render from Deploying on Frontend Changes

By default, without filters, a Monorepo push to GitHub might trigger all connected Render services. We have isolated Render builds using two complementary mechanisms:

### Method A: Infrastructure as Code (`render.yaml`) — Already Configured!
Both services in `render.yaml` (`preach-inbox-api` and `preach-inbox-worker`) include the `buildFilter` specification:

```yaml
services:
  - type: web
    name: preach-inbox-api
    runtime: node
    rootDir: backend
    buildFilter:
      paths:
        - backend/**
      ignoredPaths:
        - frontend/**
        - docs/**
        - README.md
    ...
  - type: worker
    name: preach-inbox-worker
    runtime: node
    rootDir: backend
    buildFilter:
      paths:
        - backend/**
      ignoredPaths:
        - frontend/**
        - docs/**
        - README.md
```

### Method B: Render Dashboard Setting (Manual Verification)
If you created the Render services manually through the Render Dashboard instead of the Blueprint sync:
1. Open your service in the [Render Dashboard](https://dashboard.render.com).
2. Navigate to **Settings** &rarr; **Build & Deploy**.
3. Under **Build Filters**, set:
   - **Paths**: `backend/**`
   - **Ignored Paths**: `frontend/**, docs/**, README.md`
4. Ensure **Root Directory** is explicitly set to `backend`.
5. Click **Save Changes**.

---

## 2. Deploying the Frontend to Vercel

The frontend is a modern React + TypeScript + Vite + Tailwind CSS single-page application located in `/frontend`.

### Step 1: Import Repository in Vercel
1. Log in to [Vercel](https://vercel.com) and click **Add New...** &rarr; **Project**.
2. Select your GitHub repository: `SwaroopSRP/preach-inbox-sched`.

### Step 2: Configure Project Settings
In the Vercel project configuration screen:
- **Project Name**: `preach-inbox-dashboard` (or your preferred name)
- **Framework Preset**: `Vite`
- **Root Directory**: Click **Edit** and set to `frontend`.
- **Build Command**: `npm run build` (default)
- **Output Directory**: `dist` (default)
- **Install Command**: `npm install` (default)

### Step 3: Configure Environment Variables
Under **Environment Variables**, add:

| Key | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://preach-inbox-api.onrender.com` | Base URL of your deployed Render backend (no trailing slash) |
| `VITE_FRONTEND_URL` | `https://your-app.vercel.app` | Public URL of your deployed Vercel frontend (used for OAuth returns) |

> [!NOTE]
> In local development, `VITE_API_URL` can be left empty because the Vite development server automatically proxies `/api`, `/auth`, and `/admin` requests directly to `http://localhost:3000`.

### Step 4: Single Page Application (SPA) Routing
Vercel requires rewrites so that page refreshes on client-side routes route back to `index.html`. This is already pre-configured in `frontend/vercel.json`:

```json
{
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Step 5: Click "Deploy"
Vercel will install dependencies, build the optimized Vite bundle, and deploy the application to a global edge network.

---

## 3. Production Cookie & CORS Coordination

When your frontend is hosted on Vercel (`https://your-app.vercel.app`) and your backend is on Render (`https://preach-inbox-api.onrender.com`):

1. **Update Backend FRONTEND_URL in Render**:
   - Go to your `preach-inbox-api` service in Render.
   - Set environment variable: `FRONTEND_URL=https://your-app.vercel.app` (do not include a trailing slash).
   - This ensures the Express CORS middleware allows `credentials: true` from your Vercel origin.

2. **Cross-Origin Cookie Delivery**:
   - The backend sets `SameSite=None; Secure` cookies in cross-origin production environments or standard `SameSite=Lax` on matching top-level domains.
   - Web requests via Axios use `withCredentials: true` (`frontend/src/services/api.ts`).
