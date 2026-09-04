import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

// Lua script to atomically reserve an inter-email spacing time slot per sender
const RESERVE_SPACING_SLOT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local minDelay = tonumber(ARGV[2])

local nextAvailable = tonumber(redis.call('GET', key) or "0")
if nextAvailable > now then
  local waitMs = nextAvailable - now
  redis.call('SET', key, nextAvailable + minDelay, 'PX', 120000)
  return { 0, waitMs }
else
  redis.call('SET', key, now + minDelay, 'PX', 120000)
  return { 1, 0 }
end
`;

// Lua script to atomically check and increment the hourly limit counter per sender
const CHECK_AND_INCR_HOURLY_LUA = `
local rateKey = KEYS[1]
local maxPerHour = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', rateKey) or "0")

if current >= maxPerHour then
  return { 0, current }
else
  local newCount = redis.call('INCR', rateKey)
  if newCount == 1 then
    redis.call('EXPIRE', rateKey, 7200)
  end
  return { 1, newCount }
end
`;

export interface RateLimitResult {
  allowed: boolean;
  rescheduleDelayMs?: number;
  reason?: 'SPACING_THROTTLE' | 'HOURLY_LIMIT_EXCEEDED';
  currentCount?: number;
}

export function getHourlyWindowKey(senderId: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  return `email-rate:${senderId}:${year}-${month}-${day}-${hour}`;
}

export function getMillisUntilNextHour(now = new Date()): number {
  const nextHour = new Date(now);
  nextHour.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
  return Math.max(1000, nextHour.getTime() - now.getTime());
}

export async function checkRateLimits(
  senderId: string,
  minDelayMs = env.MIN_EMAIL_DELAY_MS,
  maxHourly = env.MAX_EMAILS_PER_HOUR_PER_SENDER
): Promise<RateLimitResult> {
  const now = Date.now();

  // 1. Check Hourly Limit first
  const windowKey = getHourlyWindowKey(senderId);
  const hourlyRaw = (await redis.eval(
    CHECK_AND_INCR_HOURLY_LUA,
    1,
    windowKey,
    maxHourly
  )) as [number, number];

  const hourlyAllowed = hourlyRaw[0] === 1;
  const currentCount = hourlyRaw[1];

  if (!hourlyAllowed) {
    const rescheduleDelayMs = getMillisUntilNextHour();
    return {
      allowed: false,
      reason: 'HOURLY_LIMIT_EXCEEDED',
      rescheduleDelayMs,
      currentCount,
    };
  }

  // 2. Check and atomically reserve inter-email spacing slot
  const spacingKey = `email-delay:${senderId}`;
  const spacingRaw = (await redis.eval(
    RESERVE_SPACING_SLOT_LUA,
    1,
    spacingKey,
    now,
    minDelayMs
  )) as [number, number];

  const spacingAllowed = spacingRaw[0] === 1;
  const waitMs = spacingRaw[1];

  if (!spacingAllowed) {
    // Decrement the hourly counter since this send is deferred to a later slot
    await redis.decr(windowKey);
    return {
      allowed: false,
      reason: 'SPACING_THROTTLE',
      rescheduleDelayMs: waitMs,
    };
  }

  return {
    allowed: true,
    currentCount,
  };
}
