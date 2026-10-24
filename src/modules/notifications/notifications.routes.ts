import { Router, type RequestHandler } from 'express';

import {
  NotificationsController,
  createDispatchAuthMiddleware,
} from './notifications.controller.js';
import type { NotificationsService } from './notifications.service.js';

export function createNotificationsRouter(
  service: NotificationsService,
  authenticate: RequestHandler,
  dispatchSecret: string | undefined,
): Router {
  const controller = new NotificationsController(service);
  const requireDispatchSecret = createDispatchAuthMiddleware(dispatchSecret);
  const router = Router();

  router.put('/devices', authenticate, controller.registerDevice);
  router.delete('/devices/:token', authenticate, controller.removeDevice);
  router.post('/dispatch', requireDispatchSecret, controller.dispatch);

  return router;
}
