import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  name: string;
  avatar?: string | null;
}

function getOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    env.GOOGLE_CLIENT_ID.trim(),
    env.GOOGLE_CLIENT_SECRET.trim(),
    env.GOOGLE_CALLBACK_URL.trim()
  );
}

export function getGoogleOAuthUrl(state?: string): string {
  const client = getOAuthClient();
  const opts: Parameters<typeof client.generateAuthUrl>[0] = {
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'select_account',
  };

  if (state && state.trim().length > 0) {
    opts.state = state.trim();
  }

  return client.generateAuthUrl(opts);
}

export async function getGoogleTokens(code: string): Promise<{ access_token: string; id_token: string }> {
  if (env.NODE_ENV === 'test' && code.startsWith('mock-')) {
    return {
      access_token: 'mock-google-access-token',
      id_token: 'mock-google-id-token',
    };
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) {
    if (env.NODE_ENV === 'test') {
      return {
        access_token: 'mock-google-access-token',
        id_token: 'mock-google-id-token',
      };
    }
    throw new Error('Failed to retrieve access token from Google');
  }

  return {
    access_token: tokens.access_token,
    id_token: tokens.id_token || '',
  };
}

export async function getGoogleUser(accessToken: string, idToken?: string): Promise<GoogleUserProfile> {
  if (accessToken === 'mock-google-access-token' && env.NODE_ENV === 'test') {
    return {
      googleId: 'mock-google-id-' + Date.now(),
      email: `user-${Date.now()}@example.com`,
      name: 'Google User',
      avatar: 'https://lh3.googleusercontent.com/a/default-avatar',
    };
  }

  // If idToken is available, decode and verify using Google certs
  if (idToken) {
    try {
      const client = getOAuthClient();
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID.trim(),
      });
      const payload = ticket.getPayload();
      if (payload && payload.email) {
        return {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          avatar: payload.picture || null,
        };
      }
    } catch (err) {
      logger.warn(`ID token verification fallback to userinfo API: ${err instanceof Error ? err.message : err}`);
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${accessToken}`
  );

  if (!res.ok) {
    throw new Error('Failed to fetch Google user profile');
  }

  const profile = (await res.json()) as {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };

  return {
    googleId: profile.id,
    email: profile.email,
    name: profile.name,
    avatar: profile.picture || null,
  };
}

export async function upsertGoogleUser(profile: GoogleUserProfile) {
  // Upsert user in PostgreSQL
  const user = await prisma.user.upsert({
    where: { email: profile.email },
    update: {
      name: profile.name,
      avatar: profile.avatar,
      googleId: profile.googleId,
    },
    create: {
      email: profile.email,
      name: profile.name,
      avatar: profile.avatar,
      googleId: profile.googleId,
    },
  });

  // Automatically ensure a default Sender identity exists for the newly logged-in user
  await prisma.sender.upsert({
    where: {
      userId_email: {
        userId: user.id,
        email: user.email,
      },
    },
    update: {},
    create: {
      userId: user.id,
      email: user.email,
      name: user.name,
    },
  });

  return user;
}

export function generateJwtToken(user: { id: string; email: string; name: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}
