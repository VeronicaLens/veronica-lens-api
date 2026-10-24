import { Router, type RequestHandler } from 'express';

import { CatalogController } from './catalog.controller.js';
import type { CatalogModelPort } from './catalog.model.js';
import { CatalogService } from './catalog.service.js';

export function createCatalogRouter(
  model: CatalogModelPort,
  authenticate: RequestHandler,
): Router {
  const controller = new CatalogController(new CatalogService(model));
  const router = Router();

  router.get('/celestial-objects', authenticate, controller.search);
  router.get('/celestial-objects/:id', authenticate, controller.getById);

  return router;
}
