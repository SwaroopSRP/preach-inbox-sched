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
      },
    });
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
