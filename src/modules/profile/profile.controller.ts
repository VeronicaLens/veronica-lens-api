import type { Request, Response } from 'express';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { parseBody } from '../../shared/http/parse-body.js';
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
}
