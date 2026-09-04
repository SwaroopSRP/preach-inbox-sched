import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as authController from './auth.controller.js';

export const authRoutes = Router();

authRoutes.get('/google', authController.googleLoginHandler);
authRoutes.get('/google/callback', authController.googleCallbackHandler);
authRoutes.get('/me', requireAuth, authController.getCurrentUserHandler);
authRoutes.post('/logout', authController.logoutHandler);
