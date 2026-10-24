import express, { Router, type RequestHandler } from 'express';

import {
  AVATAR_CONTENT_TYPES,
  MAX_AVATAR_BYTES,
} from './avatar-image.js';
import type { AvatarStoragePort } from './avatar.storage.js';
import { ProfileController } from './profile.controller.js';
import type { ProfileModelPort } from './profile.model.js';
import { ProfileService } from './profile.service.js';

export function createProfileRouter(
  model: ProfileModelPort,
  avatarStorage: AvatarStoragePort,
  authenticate: RequestHandler,
): Router {
  const controller = new ProfileController(
    new ProfileService(model, avatarStorage),
  );
  const router = Router();

  router.get('/', authenticate, controller.get);
  router.patch('/', authenticate, controller.update);
  router.put(
    '/avatar',
    authenticate,
    express.raw({
      type: [...AVATAR_CONTENT_TYPES],
      limit: MAX_AVATAR_BYTES,
    }),
    controller.uploadAvatar,
  );
  router.delete('/avatar', authenticate, controller.removeAvatar);

  return router;
}
