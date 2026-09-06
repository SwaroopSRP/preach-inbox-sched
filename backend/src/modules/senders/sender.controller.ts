import { Request, Response, NextFunction } from 'express';
import { createSenderSchema } from './sender.schema.js';
import * as senderService from './sender.service.js';

export async function getSendersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const senders = await senderService.listSenders(userId);
    res.json({ senders });
  } catch (err) {
    next(err);
  }
}

export async function createSenderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const validated = createSenderSchema.parse(req.body);
    const sender = await senderService.createSender(userId, validated);
    res.status(201).json({ sender });
  } catch (err) {
    next(err);
  }
}

export async function createEtherealSenderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const name = typeof req.body.name === 'string' ? req.body.name : undefined;
    const sender = await senderService.createEtherealSender(userId, name);
    res.status(201).json({ sender });
  } catch (err) {
    next(err);
  }
}

export async function deleteSenderHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id as string;
    const senderId = req.params.id;
    await senderService.deleteSender(userId, senderId);
    res.json({ success: true, message: 'Sender deleted successfully' });
  } catch (err) {
    next(err);
  }
}

