import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service.js';
import { registerSchema, loginSchema } from './auth.schema.js';
import { env } from '../../config/env.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface AuthSuccessTemplateProps {
  name: string;
  email: string;
  avatar?: string | null;
  badgeText: string;
  targetUrl: string;
}

function renderAuthSuccessHtml({
  name,
  email,
  avatar,
  badgeText,
  targetUrl,
}: AuthSuccessTemplateProps): string {
  const safeName = escapeHtml(name || 'User');
  const safeEmail = escapeHtml(email);
  const safeBadge = escapeHtml(badgeText);
  const initial = safeName.charAt(0).toUpperCase();
  const safeTargetUrl = targetUrl.replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PreachInbox — Authentication Successful</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #0B0F19;
      background-image: 
        radial-gradient(circle at 50% 15%, rgba(16, 185, 129, 0.12) 0%, transparent 55%),
        radial-gradient(circle at 85% 85%, rgba(99, 102, 241, 0.07) 0%, transparent 45%);
      color: #F8FAFC;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .auth-card {
      background: #111827;
      border: 1px solid #1F2937;
      border-radius: 24px;
      padding: 2.75rem 2.25rem 2.25rem;
      text-align: center;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.04);
      animation: cardAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes cardAppear {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .brand-pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 0.75rem;
      font-weight: 600;
      color: #9CA3AF;
      margin-bottom: 1.75rem;
      letter-spacing: 0.01em;
    }
    .brand-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
    }
    .avatar-wrapper {
      position: relative;
      display: inline-block;
      margin-bottom: 1.25rem;
    }
    .avatar {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      object-fit: cover;
      border: 2.5px solid #10B981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
      background: #1F2937;
      display: block;
    }
    .avatar-initial {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.85rem;
      font-weight: 700;
      color: #34D399;
      background: #064E3B;
      border: 2.5px solid #10B981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
      margin: 0 auto;
    }
    .verified-icon-badge {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 24px;
      height: 24px;
      background: #10B981;
      color: #FFFFFF;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2.5px solid #111827;
      font-size: 12px;
      font-weight: 800;
    }
    h2 {
      font-size: 1.45rem;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.025em;
      margin-bottom: 0.35rem;
    }
    .email {
      font-size: 0.875rem;
      color: #9CA3AF;
      margin-bottom: 1.25rem;
      word-break: break-all;
    }
    .badge-verified {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.12);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.28);
      padding: 0.45rem 1rem;
      border-radius: 9999px;
      font-size: 0.775rem;
      font-weight: 600;
      margin-bottom: 1.75rem;
    }
    .redirect-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 14px;
      padding: 0.85rem 1.25rem;
      margin-bottom: 1.5rem;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(16, 185, 129, 0.2);
      border-top-color: #10B981;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .redirect-text {
      font-size: 0.875rem;
      font-weight: 600;
      color: #E2E8F0;
      letter-spacing: -0.01em;
      min-width: 195px;
      text-align: left;
    }
    .footer {
      border-top: 1px solid #1F2937;
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      align-items: center;
    }
    .verify-btn {
      font-size: 0.775rem;
      color: #94A3B8;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0.35rem 0.75rem;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      transition: all 0.2s;
    }
    .verify-btn:hover {
      color: #38BDF8;
      border-color: rgba(56, 189, 248, 0.3);
      background: rgba(56, 189, 248, 0.06);
    }
    .subtext {
      font-size: 0.8rem;
      color: #64748B;
    }
    .subtext a {
      color: #10B981;
      text-decoration: none;
      font-weight: 600;
    }
    .subtext a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="brand-pill">
      <span class="brand-dot"></span>
      PreachInbox Scheduler
    </div>

    <div class="avatar-wrapper">
      ${
        avatar
          ? `<img
               class="avatar"
               src="${escapeHtml(avatar)}"
               alt="${safeName}"
               referrerpolicy="no-referrer"
               crossorigin="anonymous"
               onerror="this.style.display='none'; document.getElementById('avatar-fallback').style.display='flex';"
             />
             <div id="avatar-fallback" class="avatar-initial" style="display: none;">${initial}</div>`
          : `<div class="avatar-initial">${initial}</div>`
      }
      <div class="verified-icon-badge">✓</div>
    </div>

    <h2>Welcome, ${safeName}!</h2>
    <p class="email">${safeEmail}</p>

    <div class="badge-verified">
      ${safeBadge}
    </div>

    <div class="redirect-banner">
      <div class="spinner"></div>
      <div class="redirect-text">
        Redirecting to dashboard<span id="dots">.</span>
      </div>
    </div>

    <div class="footer">
      <a class="verify-btn" href="/api/auth/me" target="_blank">
        Verify session (/api/auth/me) ↗
      </a>
      <p class="subtext">
        Not redirecting? <a href="${safeTargetUrl}">Click here</a>
      </p>
    </div>
  </div>

  <script>
    (function() {
      var dotsEl = document.getElementById('dots');
      var dotCount = 1;
      setInterval(function() {
        dotCount = (dotCount % 3) + 1;
        dotsEl.textContent = '.'.repeat(dotCount);
      }, 400);

      setTimeout(function() {
        window.location.href = "${safeTargetUrl}";
      }, 2400);
    })();
  </script>
</body>
</html>`;
}

export async function googleLoginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const redirectUrl =
      (req.query.redirect_url as string) ||
      (req.query.redirect as string) ||
      (req.query.state as string) ||
      '';
    const url = authService.getGoogleOAuthUrl(redirectUrl);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

export async function googleCallbackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const targetUrl = (state && (state.startsWith('http://') || state.startsWith('https://')))
      ? state.replace(/\/+$/, '')
      : env.FRONTEND_URL.replace(/\/+$/, '');

    if (!code) {
      return res.redirect(`${targetUrl}/login?error=missing_code`);
    }

    const { access_token, id_token } = await authService.getGoogleTokens(code);
    const profile = await authService.getGoogleUser(access_token, id_token);
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
    return res.send(
      renderAuthSuccessHtml({
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        badgeText: '✓ Google OAuth Verified & Session Cookie Set',
        targetUrl,
      })
    );
  } catch (err) {
    next(err);
  }
}

export async function devLoginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const email = (req.query.email as string) || 'srp31.swaroop@gmail.com';
    const name = (req.query.name as string) || 'Swaroop (Dev)';
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=059669&color=fff&bold=true`;

    const user = await authService.upsertGoogleUser({
      googleId: 'google-dev-' + email,
      email,
      name,
      avatar,
    });

    const token = authService.generateJwtToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.json({ success: true, user, token });
    }

    const redirectUrl = (req.query.redirect_url as string) || (req.query.redirect as string);
    const targetUrl = (redirectUrl && (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')))
      ? redirectUrl.replace(/\/+$/, '')
      : env.FRONTEND_URL.replace(/\/+$/, '');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(
      renderAuthSuccessHtml({
        name,
        email,
        avatar,
        badgeText: '✓ Session Active & Token Cookie Set',
        targetUrl,
      })
    );
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

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const validated = registerSchema.parse(req.body);
    const { user, token } = await authService.registerUser(validated);

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: 'Registration successful',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const validated = loginSchema.parse(req.body);
    const { user, token } = await authService.loginUser(validated);

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
}

