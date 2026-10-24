import type { Request } from 'express';

import { AppError } from '../errors/app-error.js';
import type { AuthContext } from './auth-context.js';

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return req.auth;
}
