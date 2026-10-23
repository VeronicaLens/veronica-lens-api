import { Router } from 'express';

import { AuthController } from './auth.controller.js';
import type { AuthModelPort } from './auth.model.js';
import { createAuthRateLimiter } from './auth.rate-limit.js';
import { AuthService } from './auth.service.js';

export function createAuthRouter(model: AuthModelPort): Router {
  const service = new AuthService(model);
  const controller = new AuthController(service);
  const limiter = createAuthRateLimiter();
  const router = Router();

  router.post('/sign-up', limiter, controller.signUp);
  router.post('/sign-in', limiter, controller.signIn);
  router.post('/refresh', limiter, controller.refresh);

  return router;
}