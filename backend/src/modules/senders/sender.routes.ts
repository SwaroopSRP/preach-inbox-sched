import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as senderController from './sender.controller.js';

export const senderRoutes = Router();

senderRoutes.use(requireAuth);

senderRoutes.get('/', senderController.getSendersHandler);
senderRoutes.post('/', senderController.createSenderHandler);
