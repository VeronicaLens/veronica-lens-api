import { Router, type RequestHandler } from 'express';

import { EventsController } from './events.controller.js';
import type { EventsModelPort } from './events.model.js';
import { EventsService } from './events.service.js';

export function createEventsRouter(
  model: EventsModelPort,
  authenticate: RequestHandler,
): Router {
  const controller = new EventsController(new EventsService(model));
  const router = Router();

  router.get('/', authenticate, controller.list);
  router.get('/:id', authenticate, controller.getById);

  return router;
}
