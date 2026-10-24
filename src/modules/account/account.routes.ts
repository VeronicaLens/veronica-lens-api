import { Router, type RequestHandler } from 'express';

import { AccountController } from './account.controller.js';
import type { AccountModelPort } from './account.model.js';
import { AccountService } from './account.service.js';

export function createAccountRouter(
  model: AccountModelPort,
  authenticate: RequestHandler,
): Router {
  const controller = new AccountController(new AccountService(model));
  const router = Router();

  router.delete('/', authenticate, controller.delete);

  return router;
}
