import type { RequestHandler } from 'express';

import type { AuthService } from '../../modules/auth/auth.service.js';
import { AppError } from '../errors/app-error.js';
import './auth-context.js';

export function createAuthenticateMiddleware(
  service: Pick<AuthService, 'authenticate'>,
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const authorization = req.get('authorization');

    if (!authorization) {
      res.setHeader('WWW-Authenticate', 'Bearer');

      throw new AppError(
        401,
        'AUTH_REQUIRED',
        'Authentication is required',
      );
    }

    const match = /^Bearer[ \t]+(\S+)$/i.exec(authorization);

    if (!match) {
      res.setHeader('WWW-Authenticate', 'Bearer');

      throw new AppError(
        401,
        'AUTH_TOKEN_INVALID',
        'Authentication token is invalid or expired',
      );
    }

    const accessToken = match[1];
    const user = await service.authenticate(accessToken);

    req.auth = {
      user,
      accessToken,
    };

    next();
  };
}