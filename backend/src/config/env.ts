import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Elasticsearch
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().default('mock-google-client-id'),
  GOOGLE_CLIENT_SECRET: z.string().default('mock-google-client-secret'),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3000/api/auth/google/callback'),
  JWT_SECRET: z.string().default('super-secret-jwt-key-replace-in-production-min-32-chars'),
  SESSION_SECRET: z.string().default('super-secret-session-key-replace-in-production'),

  // Ethereal SMTP
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().default(587),
  ETHEREAL_USER: z.string().optional(),
  ETHEREAL_PASSWORD: z.string().optional(),

  // Slack OAuth
  SLACK_CLIENT_ID: z.string().default('mock-slack-client-id'),
  SLACK_CLIENT_SECRET: z.string().default('mock-slack-client-secret'),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:3000/api/integrations/slack/callback'),

  // Queue & Worker Concurrency / Throttling
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:\n', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const env = parsed.data;
