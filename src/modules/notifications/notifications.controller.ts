import { createHash, timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import { parseBody } from '../../shared/http/parse-body.js';
import { registerDeviceSchema } from './notifications.schemas.js';
import type { NotificationsService } from './notifications.service.js';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  registerDevice = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const input = parseBody(registerDeviceSchema, req.body);
    const device = await this.service.registerDevice(auth, input);

    res.status(200).json({ data: { device } });
  };

  removeDevice = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    await this.service.removeDevice(auth, String(req.params.token));

    res.status(204).end();
  };

  dispatch = async (_req: Request, res: Response): Promise<void> => {
    const summary = await this.service.dispatchDueNotifications();

    res.status(200).json({ data: { summary } });
  };
}

// Compare digests so the length of the secret does not leak through timing.
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();

  return timingSafeEqual(a, b);
}

// The dispatch endpoint is for scheduled jobs, not app users. It is disabled
// unless NOTIFICATIONS_DISPATCH_SECRET is configured.
export function createDispatchAuthMiddleware(secret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (secret === undefined) {
      next(
        new AppError(503, 'DISPATCH_DISABLED', 'Notification dispatch is not configured'),
      );
      return;
    }

    const provided = /^Bearer[ \t]+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];

    if (provided === undefined || !secretsMatch(provided, secret)) {
      next(new AppError(401, 'DISPATCH_UNAUTHORIZED', 'Dispatch credentials are invalid'));
      return;
    }

    next();
  };
}
