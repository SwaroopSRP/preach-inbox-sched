import { Request, Response, NextFunction } from 'express';
import { scheduleEmailSchema } from './email.schema.js';
import * as emailService from './email.service.js';

export async function scheduleEmailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const validated = scheduleEmailSchema.parse(req.body);
    const emails = await emailService.scheduleEmails(userId, validated);
    res.status(201).json({
      message: `Successfully scheduled ${emails.length} email(s)`,
      emails,
    });
  } catch (err) {
    next(err);
  }
}

export async function getScheduledEmailsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const emails = await emailService.listScheduledEmails(userId);
    res.json({ emails });
  } catch (err) {
    next(err);
  }
}

export async function getSentEmailsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const emails = await emailService.listSentEmails(userId);
    res.json({ emails });
  } catch (err) {
    next(err);
  }
}

export async function getEmailByIdHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const emailId = req.params.id as string;
    const email = await emailService.getEmailById(emailId, userId);
    res.json({ email });
  } catch (err) {
    next(err);
  }
}

export async function searchEmailsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const query = (req.query.q as string) || '';
    const results = await emailService.searchEmails(userId, query);
    res.json(results);
  } catch (err) {
    next(err);
  }
}
