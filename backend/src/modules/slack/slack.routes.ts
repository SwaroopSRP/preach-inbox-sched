import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import * as slackController from './slack.controller.js';

export const slackRoutes = Router();

slackRoutes.get('/connect', requireAuth, slackController.connectSlackHandler);
slackRoutes.get('/callback', slackController.slackCallbackHandler);
slackRoutes.get('/status', requireAuth, slackController.getSlackStatusHandler);
slackRoutes.post('/disconnect', requireAuth, slackController.disconnectSlackHandler);
