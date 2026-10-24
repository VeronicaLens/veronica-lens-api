import { Router, type RequestHandler } from 'express';

import type { EphemerisProviderPort } from '../astronomy/index.js';
import type { CatalogModelPort } from '../catalog/catalog.model.js';
import type { WeatherProviderPort } from '../weather/index.js';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';

export function createPlanningRouter(
  catalog: CatalogModelPort,
  ephemeris: EphemerisProviderPort,
  weather: WeatherProviderPort,
  authenticate: RequestHandler,
): Router {
  const controller = new PlanningController(
    new PlanningService(catalog, ephemeris, weather),
  );
  const router = Router();

  // POST keeps the observer location out of URLs and access logs.
  router.post('/recommendation', authenticate, controller.recommend);

  return router;
}
