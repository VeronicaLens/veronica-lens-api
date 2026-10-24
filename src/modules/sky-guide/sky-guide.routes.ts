import { Router, type RequestHandler } from 'express';

import type { EphemerisProviderPort } from '../astronomy/index.js';
import type { CatalogModelPort } from '../catalog/catalog.model.js';
import { SkyGuideController } from './sky-guide.controller.js';
import { SkyGuideService } from './sky-guide.service.js';

export function createSkyGuideRouter(
  catalog: CatalogModelPort,
  ephemeris: EphemerisProviderPort,
  authenticate: RequestHandler,
): Router {
  const controller = new SkyGuideController(
    new SkyGuideService(catalog, ephemeris),
  );
  const router = Router();

  // POST keeps the observer location out of URLs and access logs.
  router.post('/positions', authenticate, controller.positions);

  return router;
}
