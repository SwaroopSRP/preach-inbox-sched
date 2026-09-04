import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as emailController from './email.controller.js';

export const emailRoutes = Router();

emailRoutes.use(requireAuth);

emailRoutes.post('/schedule', emailController.scheduleEmailHandler);
emailRoutes.get('/scheduled', emailController.getScheduledEmailsHandler);
emailRoutes.get('/sent', emailController.getSentEmailsHandler);
emailRoutes.get('/:id', emailController.getEmailByIdHandler);
