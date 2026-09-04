import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export function createRedisConnection(name = 'default'): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Critical requirement for BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  connection.on('connect', () => {
    logger.info(`Redis [${name}] connected successfully`);
  });

  connection.on('error', (err) => {
    logger.error(`Redis [${name}] connection error: ${err.message}`);
  });

  return connection;
}

// Shared general-purpose Redis client for rate limiting / cache operations
export const redis = createRedisConnection('shared');
