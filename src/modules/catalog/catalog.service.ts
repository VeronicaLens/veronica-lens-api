import { AppError } from '../../shared/errors/app-error.js';
import type { CatalogModelPort } from './catalog.model.js';
import type { SearchCatalogQuery } from './catalog.schemas.js';
import type { CelestialObject } from './catalog.types.js';

export class CatalogService {
  constructor(private readonly model: CatalogModelPort) {}

  async search(query: SearchCatalogQuery): Promise<CelestialObject[]> {
    return this.model.findMany({
      ...(query.q !== undefined && { searchTerm: query.q }),
      ...(query.type !== undefined && { type: query.type }),
      limit: query.limit,
    });
  }

  async getById(id: string): Promise<CelestialObject> {
    const object = await this.model.findById(id);

    if (!object) {
      throw new AppError(
        404,
        'CELESTIAL_OBJECT_NOT_FOUND',
        'Celestial object was not found',
      );
    }

    return object;
  }
}
