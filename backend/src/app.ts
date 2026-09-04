import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';

import { emailRoutes } from './modules/emails/email.routes.js';
import { senderRoutes } from './modules/senders/sender.routes.js';
import { slackRoutes } from './modules/slack/slack.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { registerRateLimitNotifier } from './workers/email.worker.js';
import { notifySlackOnRateLimit } from './modules/slack/slack.service.js';

// Register Slack rate-limit notifier hook
registerRateLimitNotifier(notifySlackOnRateLimit);

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

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'preach-inbox-sched-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Feature routes
  app.use('/api/auth', authRoutes);
  app.use('/auth', authRoutes); // Route alias requested in PRD
  app.use('/api/emails', emailRoutes);
  app.use('/api/senders', senderRoutes);
  app.use('/api/integrations/slack', slackRoutes);

  // Centralized error handling
  app.use(errorHandler);

  return app;
}
