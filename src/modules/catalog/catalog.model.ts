import { CATALOG } from './catalog.data.js';
import type {
  CelestialObject,
  CelestialObjectType,
} from './catalog.types.js';

export interface CatalogFilter {
  searchTerm?: string;
  type?: CelestialObjectType;
  limit: number;
}

export interface CatalogModelPort {
  findMany(filter: CatalogFilter): Promise<CelestialObject[]>;
  findById(id: string): Promise<CelestialObject | null>;
}

// Case- and accent-insensitive: "orion" matches "Órion".
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

export class StaticCatalogModel implements CatalogModelPort {
  constructor(private readonly objects = CATALOG) {}

  async findMany(filter: CatalogFilter): Promise<CelestialObject[]> {
    const term =
      filter.searchTerm === undefined ? null : normalize(filter.searchTerm);

    return this.objects
      .filter((object) => !filter.type || object.type === filter.type)
      .filter(
        (object) =>
          term === null ||
          [object.id, object.name, ...object.aliases].some((value) =>
            normalize(value).includes(term),
          ),
      )
      .slice(0, filter.limit)
      .map((object) => structuredClone(object) as CelestialObject);
  }

  async findById(id: string): Promise<CelestialObject | null> {
    const object = this.objects.find((candidate) => candidate.id === id);

    return object ? (structuredClone(object) as CelestialObject) : null;
  }
}
