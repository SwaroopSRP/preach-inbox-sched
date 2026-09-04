import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';

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

  return app;
}
