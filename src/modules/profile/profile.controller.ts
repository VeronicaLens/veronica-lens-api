import type { Request, Response } from 'express';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import { parseBody } from '../../shared/http/parse-body.js';
import { isAvatarContentType } from './avatar-image.js';
import { updateProfileSchema } from './profile.schemas.js';
import type { ProfileService } from './profile.service.js';

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.get(requireAuth(req));

    res.status(200).json({ data: { profile } });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = parseBody(updateProfileSchema, req.body);
    const profile = await this.service.update(auth, input);

    res.status(200).json({ data: { profile } });
  };

  uploadAvatar = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const contentType = req
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();

    if (!isAvatarContentType(contentType)) {
      throw new AppError(
        415,
        'AVATAR_TYPE_UNSUPPORTED',
        'Avatar must be a JPEG, PNG or WebP image',
      );
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new AppError(400, 'AVATAR_INVALID', 'Avatar file is empty');
    }

    const profile = await this.service.uploadAvatar(auth, {
      contentType,
      bytes: req.body,
    });

    res.status(200).json({ data: { profile } });
  };

  removeAvatar = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.removeAvatar(requireAuth(req));

    res.status(200).json({ data: { profile } });
  };
}
