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
    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
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

    // Render visual login confirmation page before redirecting to frontend dashboard
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PreachInbox — Authentication Successful</title>
        <style>
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            padding: 2.5rem;
            border-radius: 12px;
            text-align: center;
            max-width: 420px;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3);
          }
          .avatar {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            border: 3px solid #38bdf8;
            margin-bottom: 1rem;
            object-fit: cover;
          }
          h2 { margin: 0 0 0.5rem 0; font-size: 1.5rem; font-weight: 600; }
          p { color: #94a3b8; margin: 0 0 1.25rem 0; font-size: 0.95rem; }
          .badge {
            display: inline-block;
            background: #0369a1;
            color: #e0f2fe;
            padding: 0.35rem 0.85rem;
            border-radius: 9999px;
            font-size: 0.8rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
          }
          .btn {
            display: block;
            background: #0284c7;
            color: #ffffff;
            text-decoration: none;
            padding: 0.75rem 1.25rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            transition: background 0.2s;
          }
          .btn:hover { background: #0369a1; }
          .subtext { font-size: 0.8rem; color: #64748b; margin-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          ${user.avatar ? `<img class="avatar" src="${user.avatar}" alt="${user.name}" />` : ''}
          <h2>Welcome, ${user.name}!</h2>
          <p>${user.email}</p>
          <div class="badge">✓ Google OAuth Verified & Session Cookie Set</div>
          <a class="btn" href="${env.FRONTEND_URL}/dashboard">Continue to Dashboard &rarr;</a>
          <p class="subtext">Redirecting automatically in 3 seconds...</p>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = '${env.FRONTEND_URL}/dashboard';
          }, 3000);
        </script>
      </body>
      </html>
    `);
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
