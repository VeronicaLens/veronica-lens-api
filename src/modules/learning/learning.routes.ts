import { Router, type RequestHandler } from 'express';

import type { LearningModelPort } from './learning.model.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';

export function createLearningRouter(
  model: LearningModelPort,
  authenticate: RequestHandler,
): Router {
  const controller = new LearningController(new LearningService(model));
  const router = Router();

  router.get('/tracks', authenticate, controller.listTracks);
  router.get('/tracks/:slug', authenticate, controller.getTrack);
  router.get('/lessons/:id', authenticate, controller.getLesson);
  router.put('/lessons/:id/progress', authenticate, controller.updateProgress);

  return router;
}
