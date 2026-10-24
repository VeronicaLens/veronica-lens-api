import type { Request, Response } from 'express';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { parseBody } from '../../shared/http/parse-body.js';
import { deleteAccountSchema } from './account.schemas.js';
import type { AccountService } from './account.service.js';

export class AccountController {
  constructor(private readonly service: AccountService) {}

  delete = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);

    parseBody(deleteAccountSchema, req.body);
    await this.service.deleteAccount(auth);

    res.status(204).send();
  };
}
