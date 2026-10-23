import { Router } from 'express';

import { AuthController } from './auth.controller.js';
import type { AuthModelPort } from './auth.model.js';
import { AuthService } from './auth.service.js';

export function createAuthRouter(model: AuthModelPort): Router {
  const service = new AuthService(model);
  const controller = new AuthController(service);
  const router = Router();

  router.post('/sign-up', controller.signUp);
  router.post('/sign-in', controller.signIn);

  return router;
}