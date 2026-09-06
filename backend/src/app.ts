import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';

import { emailRoutes } from './modules/emails/email.routes.js';
import { senderRoutes } from './modules/senders/sender.routes.js';
import { slackRoutes } from './modules/slack/slack.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { setupBullBoard } from './queue/bullboard.js';
import { registerRateLimitNotifier, getActiveWorker } from './workers/email.worker.js';
import { notifySlackOnRateLimit } from './modules/slack/slack.service.js';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { pingElasticsearch } from './lib/elasticsearch.js';
import { logger } from './lib/logger.js';

// Register Slack rate-limit notifier hook
registerRateLimitNotifier(notifySlackOnRateLimit);

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.then((val) => {
      clearTimeout(timer);
      return val;
    }),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Log incoming HTTP requests in development & production
  if (env.NODE_ENV !== 'test') {
    app.use((req, _res, next) => {
      logger.info(`HTTP ${req.method} ${req.url}`);
      next();
    });
  }

  // Health and root keepalive endpoint (completely unauthenticated, no rate limits)
  app.get(['/', '/health'], async (_req: Request, res: Response) => {
    let redisStatus = 'disconnected';
    let redisLatencyMs: number | null = null;
    try {
      const start = Date.now();
      const pong = await withTimeout(redis.ping(), 1500, 'TIMEOUT');
      if (pong === 'PONG') {
        redisStatus = 'connected';
        redisLatencyMs = Date.now() - start;
      } else if (pong === 'TIMEOUT') {
        redisStatus = 'timeout';
      }
    } catch (err: any) {
      redisStatus = `error: ${err.message}`;
    }

    let dbStatus = 'disconnected';
    let dbLatencyMs: number | null = null;
    try {
      const start = Date.now();
      const result = await withTimeout(prisma.$queryRaw`SELECT 1`, 1500, null);
      if (result !== null) {
        dbStatus = 'connected';
        dbLatencyMs = Date.now() - start;
      } else {
        dbStatus = 'timeout';
      }
    } catch (err: any) {
      dbStatus = `error: ${err.message}`;
    }

    const activeWorker = getActiveWorker();
    const workerStatus = activeWorker ? (activeWorker.isRunning() ? 'active' : 'paused') : 'ready';

    const esPing = await withTimeout(
      pingElasticsearch(),
      1500,
      { connected: false, error: 'probe_timeout' }
    );

    res.status(200).json({
      status: 'ok',
      service: 'preach-inbox-sched-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: {
        redis: {
          status: redisStatus,
          latencyMs: redisLatencyMs,
        },
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
        bullmq: {
          status: redisStatus === 'connected' ? 'ready' : 'degraded',
          worker: workerStatus,
        },
        elasticsearch: {
          status: esPing.connected ? 'connected' : 'disconnected (postgres fallback active)',
          latencyMs: esPing.latencyMs,
          version: esPing.version,
        },
      },
    });
  });

  // Privacy Policy endpoint for Google OAuth verification
  app.get('/privacy-policy', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PreachInbox — Privacy Policy</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1e293b; }
          h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
          h2 { color: #334155; margin-top: 1.75rem; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy for PreachInbox</h1>
        <p><em>Last updated: September 2026</em></p>
        <h2>1. Information We Collect</h2>
        <p>When you authenticate via Google OAuth, PreachInbox accesses basic profile information (name, email, avatar) to establish your account identity and authorize email dispatch schedules.</p>
        <h2>2. Use of Google User Data</h2>
        <p>PreachInbox's use of information received from Google APIs adheres to the Google API Services User Data Policy, including Limited Use requirements. We do not sell or transfer your data to third parties.</p>
        <h2>3. Data Retention and Security</h2>
        <p>Your session tokens are stored in secure, encrypted, HTTP-only cookies. Scheduled emails and sender profiles are isolated to your authenticated user account.</p>
      </body>
      </html>
    `);
  });

  // Feature routes
  app.use('/api/auth', authRoutes);
  app.use('/auth', authRoutes); // Route alias requested in PRD
  app.use('/api/emails', emailRoutes);
  app.use('/api/senders', senderRoutes);
  app.use('/api/integrations/slack', slackRoutes);

  // Bull Board Queue Dashboard
  app.use('/admin/queues', setupBullBoard());

  // Centralized error handling
  app.use(errorHandler);

  return app;
}
