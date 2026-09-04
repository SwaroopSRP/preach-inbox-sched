import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from './error.middleware.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Check Bearer token or cookie
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          };
          return next();
        }
      } catch {
        // Invalid token, fall through to dev/test fallback if applicable
      }
    }

    // 2. Dev / Test explicit header support or fallback user
    if (env.NODE_ENV !== 'production') {
      const devUserId = req.headers['x-user-id'] as string;
      if (devUserId) {
        const user = await prisma.user.findUnique({ where: { id: devUserId } });
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          };
          return next();
        }
      }

      // Default seeded dev user for frictionless local API testing
      let devUser = await prisma.user.findFirst();
      if (!devUser) {
        devUser = await prisma.user.create({
          data: {
            email: 'dev@reachinbox.test',
            name: 'Dev User',
            googleId: 'mock-google-id-dev',
          },
        });
      }
      req.user = {
        id: devUser.id,
        email: devUser.email,
        name: devUser.name,
        avatar: devUser.avatar,
      };
      return next();
    }

    throw new AppError(401, 'Authentication required');
  } catch (err) {
    next(err);
  }
}
