import { Request, Response, NextFunction } from 'express';
import * as slackService from './slack.service.js';
import { env } from '../../config/env.js';

export async function connectSlackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const authUrl = slackService.getSlackAuthorizeUrl(userId);
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
}

export async function slackCallbackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const code = req.query.code as string;
    const stateUserId = (req.query.state as string) || (req.user?.id as string);

    const frontendBase = env.FRONTEND_URL.replace(/\/+$/, '');
    if (!code) {
      return res.redirect(`${frontendBase}/?slack_error=missing_code`);
    }

    await slackService.exchangeSlackCode(code, stateUserId);
    res.redirect(`${frontendBase}/?slack=connected`);
  } catch (err) {
    next(err);
  }
}

export async function getSlackStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const status = await slackService.getSlackStatus(userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

export async function disconnectSlackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const result = await slackService.disconnectSlack(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
