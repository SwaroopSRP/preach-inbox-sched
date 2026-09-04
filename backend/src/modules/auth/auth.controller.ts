import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { env } from '../../config/env.js';

export async function googleLoginHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const url = authService.getGoogleOAuthUrl();
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

export async function googleCallbackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.redirect(`${env.FRONTEND_URL}/login?error=missing_code`);
    }

    const { access_token } = await authService.getGoogleTokens(code);
    const profile = await authService.getGoogleUser(access_token);
    const user = await authService.upsertGoogleUser(profile);
    const token = authService.generateJwtToken(user);

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // If client requested json (e.g. in test or programmatic client)
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
        },
        token,
      });
    }

    // Redirect back to frontend dashboard
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    next(err);
  }
}

export async function getCurrentUserHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
      user: req.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(_req: Request, res: Response) {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
}
