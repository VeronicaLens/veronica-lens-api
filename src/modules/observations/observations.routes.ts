import express, { Router, type RequestHandler } from 'express';

import {
  MAX_OBSERVATION_PHOTO_BYTES,
  OBSERVATION_PHOTO_CONTENT_TYPES,
} from './observation-photo.js';
import { ObservationsController } from './observations.controller.js';
import type { ObservationsModelPort } from './observations.model.js';
import { ObservationsService } from './observations.service.js';

export function createObservationsRouter(
  model: ObservationsModelPort,
  authenticate: RequestHandler,
): Router {
  const controller = new ObservationsController(new ObservationsService(model));
  const router = Router();

  router.get('/', authenticate, controller.list);
  router.put(
    '/:observationId/photos/:photoId',
    authenticate,
    express.raw({
      type: [...OBSERVATION_PHOTO_CONTENT_TYPES],
      limit: MAX_OBSERVATION_PHOTO_BYTES,
    }),
    controller.savePhoto,
  );
  router.delete(
    '/:observationId/photos/:photoId',
    authenticate,
    controller.deletePhoto,
  );
  router.delete('/:observationId', authenticate, controller.deleteObservation);

  return router;
}
