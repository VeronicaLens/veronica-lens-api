import { Router, type RequestHandler } from 'express';

import { ProfileController } from './profile.controller.js';
import type { ProfileModelPort } from './profile.model.js';
import { ProfileService } from './profile.service.js';

export function createProfileRouter(
  model: ProfileModelPort,
  authenticate: RequestHandler,
): Router {
  const controller = new ProfileController(new ProfileService(model));
  const router = Router();

  router.get('/', authenticate, controller.get);
  router.patch('/', authenticate, controller.update);

  return router;
}
