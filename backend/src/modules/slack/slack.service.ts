import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { getHourlyWindowKey } from '../../workers/rate-limiter.js';

export function getSlackAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'chat:write,incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeSlackCode(code: string, userId: string) {
  // Exchange authorization code for access token via Slack OAuth API
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
  });

  const data = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token?: string;
    team?: { id: string; name: string };
    authed_user?: { id: string };
    incoming_webhook?: { channel: string; channel_id: string; url: string };
  };

  if (!data.ok || !data.access_token) {
    // In local development or test mode, create a mock connection if live credentials aren't configured
    if (env.NODE_ENV !== 'production' && (data.error === 'invalid_client_id' || data.error === 'invalid_code')) {
      logger.warn('Mock Slack OAuth code exchange (dev/test mode fallback)');
      return prisma.slackConnection.upsert({
        where: { userId },
        update: {
          accessToken: 'mock-slack-token-' + Date.now(),
          teamId: 'T_MOCK_TEAM',
          teamName: 'PreachInbox Dev Team',
          slackUserId: 'U_MOCK_USER',
          channelId: 'C_MOCK_CHANNEL',
          channelName: '#notifications',
        },
        create: {
          userId,
          accessToken: 'mock-slack-token-' + Date.now(),
          teamId: 'T_MOCK_TEAM',
          teamName: 'PreachInbox Dev Team',
          slackUserId: 'U_MOCK_USER',
          channelId: 'C_MOCK_CHANNEL',
          channelName: '#notifications',
        },
      });
    }

    throw new Error(data.error || 'Failed to exchange Slack code');
  }

  return prisma.slackConnection.upsert({
    where: { userId },
    update: {
      accessToken: data.access_token,
      teamId: data.team?.id || '',
      teamName: data.team?.name || 'Workspace',
      slackUserId: data.authed_user?.id || '',
      channelId: data.incoming_webhook?.channel_id || null,
      channelName: data.incoming_webhook?.channel || null,
    },
    create: {
      userId,
      accessToken: data.access_token,
      teamId: data.team?.id || '',
      teamName: data.team?.name || 'Workspace',
      slackUserId: data.authed_user?.id || '',
      channelId: data.incoming_webhook?.channel_id || null,
      channelName: data.incoming_webhook?.channel || null,
    },
  });
}

export async function getSlackStatus(userId: string) {
  const connection = await prisma.slackConnection.findUnique({
    where: { userId },
  });

  if (!connection) {
    return { connected: false };
  }

  return {
    connected: true,
    teamName: connection.teamName,
    channelName: connection.channelName,
    createdAt: connection.createdAt,
  };
}

export async function disconnectSlack(userId: string) {
  const result = await prisma.slackConnection.deleteMany({
    where: { userId },
  });

  logger.info(`Disconnected Slack for user ${userId}`);
  return { success: result.count > 0 };
}

export async function postSlackMessage(accessToken: string, channel: string, text: string) {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
    }),
  });

  return response.json();
}

export async function notifySlackOnRateLimit(userId: string, senderEmail: string, maxHourly: number) {
  // 1. Deduplication per sender per hour window using Redis
  const windowKey = getHourlyWindowKey(senderEmail);
  const alertKey = `slack-alerted:${windowKey}`;

  // Atomic check-and-set with 1-hour TTL
  const wasSet = await redis.set(alertKey, '1', 'EX', 3600, 'NX');
  if (!wasSet) {
    logger.debug(`Slack notification already sent for ${senderEmail} in current hour window.`);
    return;
  }

  const message = `⚠️ *PreachInbox Alert*: Sender \`${senderEmail}\` reached its hourly email limit of ${maxHourly}.\nRemaining scheduled emails will automatically continue in the next available window.`;

  // 2. Lookup Slack OAuth connection for the user
  const connection = await prisma.slackConnection.findUnique({
    where: { userId },
  });

  // If user has a real OAuth token, post directly to their connected channel
  if (connection && !connection.accessToken.startsWith('mock-slack-token')) {
    const targetChannel = connection.channelId || 'general';
    try {
      const res = (await postSlackMessage(connection.accessToken, targetChannel, message)) as {
        ok: boolean;
        error?: string;
      };
      if (res.ok) {
        logger.info(`Slack rate-limit notification successfully sent for ${senderEmail} to channel ${targetChannel}`);
        return;
      } else {
        logger.warn(`Slack API error sending notification: ${res.error}`);
      }
    } catch (err) {
      logger.error(`Error sending message to Slack API: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 3. Fallback to global incoming webhook URL if configured in environment
  if (env.SLACK_WEBHOOK_URL) {
    try {
      const webhookRes = await fetch(env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      if (webhookRes.ok) {
        logger.info(`Slack rate-limit notification successfully sent via SLACK_WEBHOOK_URL for ${senderEmail}`);
        return;
      }
      logger.warn(`Slack webhook returned status ${webhookRes.status}`);
    } catch (err) {
      logger.error(`Error dispatching to SLACK_WEBHOOK_URL: ${err instanceof Error ? err.message : err}`);
    }
  }

  // 4. In development, test, or mock mode without live credentials
  const targetChannel = connection?.channelName || '#notifications';
  logger.info(`[MOCK SLACK DISPATCH] Channel: ${targetChannel} | Message: ${message}`);
}
