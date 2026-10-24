import { Router, type RequestHandler } from 'express';

import type { WeatherProviderPort } from '../weather/index.js';
import { ConditionsController } from './conditions.controller.js';
import { ConditionsService } from './conditions.service.js';

export function createConditionsRouter(
  weather: WeatherProviderPort,
  authenticate: RequestHandler,
): Router {
  const controller = new ConditionsController(new ConditionsService(weather));
  const router = Router();

  // POST keeps the observer location out of URLs and access logs.
  router.post('/current', authenticate, controller.current);
  router.post('/forecast', authenticate, controller.forecast);

  return router;
}
