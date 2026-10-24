import type { Request, Response } from 'express';

import { AppError } from '../../shared/errors/app-error.js';
import { parseQuery } from '../../shared/http/parse-query.js';
import {
  celestialObjectIdSchema,
  searchCatalogSchema,
} from './catalog.schemas.js';
import type { CatalogService } from './catalog.service.js';

export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  search = async (req: Request, res: Response): Promise<void> => {
    const query = parseQuery(searchCatalogSchema, req.query);
    const objects = await this.service.search(query);

    res.status(200).json({
      data: { objects },
      meta: { count: objects.length },
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const id = celestialObjectIdSchema.safeParse(req.params.id);

    // Malformed ids cannot exist in the catalog.
    if (!id.success) {
      throw new AppError(
        404,
        'CELESTIAL_OBJECT_NOT_FOUND',
        'Celestial object was not found',
      );
    }

    const object = await this.service.getById(id.data);

    res.status(200).json({ data: { object } });
  };
}
