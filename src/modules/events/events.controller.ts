import type { Request, Response } from 'express';

import { requireAuth } from '../../shared/auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import { parseQuery } from '../../shared/http/parse-query.js';
import { eventIdSchema, listEventsSchema } from './events.schemas.js';
import type { EventsService } from './events.service.js';

export class EventsController {
  constructor(private readonly service: EventsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const query = parseQuery(listEventsSchema, req.query);
    const result = await this.service.list(auth, query);

    res.status(200).json({
      data: result,
      meta: { count: result.events.length },
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const auth = requireAuth(req);
    const id = eventIdSchema.safeParse(req.params.id);

    // Malformed ids cannot exist; avoid sending them to the database.
    if (!id.success) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'Astronomical event was not found');
    }

    res.status(200).json({ data: { event: await this.service.getById(auth, id.data) } });
  };
}
