import { Router } from 'express';

import { createAuthenticateMiddleware } from '../../shared/auth/authenticate.middleware.js';
import { AuthController } from './auth.controller.js';
import type { AuthModelPort } from './auth.model.js';
import { createAuthRateLimiter } from './auth.rate-limit.js';
import { AuthService } from './auth.service.js';

export function createAuthRouter(model: AuthModelPort): Router {
  const service = new AuthService(model);
  const controller = new AuthController(service);
  const limiter = createAuthRateLimiter();
  const authenticate = createAuthenticateMiddleware(service);
  const router = Router();

  router.post('/sign-up', limiter, controller.signUp);
  router.post('/sign-in', limiter, controller.signIn);
  router.post('/google', limiter, controller.signInWithGoogle);
  router.post('/refresh', limiter, controller.refresh);
  router.post('/sign-out', authenticate, controller.signOut);
  router.post('/password/recovery',limiter,controller.requestPasswordRecovery);
  router.put('/password',limiter,authenticate,controller.updatePassword);

  router.get('/me', authenticate, controller.me);

  return router;
}