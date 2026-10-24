import { describe, expect, it } from 'vitest';

import { CATALOG } from '../../src/modules/catalog/catalog.data.js';
import { StaticCatalogModel } from '../../src/modules/catalog/catalog.model.js';
import { CELESTIAL_OBJECT_TYPES } from '../../src/modules/catalog/catalog.types.js';

describe('catalog data', () => {
  it('has unique, URL-safe ids', () => {
    const ids = CATALOG.map((object) => object.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('has valid types, names and coordinates', () => {
    for (const object of CATALOG) {
      expect(CELESTIAL_OBJECT_TYPES).toContain(object.type);
      expect(object.name.trim().length).toBeGreaterThan(0);

      if (object.coordinates.kind === 'fixed') {
        expect(['star', 'constellation']).toContain(object.type);
        expect(object.coordinates.rightAscensionDegrees).toBeGreaterThanOrEqual(0);
        expect(object.coordinates.rightAscensionDegrees).toBeLessThan(360);
        expect(object.coordinates.declinationDegrees).toBeGreaterThanOrEqual(-90);
        expect(object.coordinates.declinationDegrees).toBeLessThanOrEqual(90);
      } else {
        expect(['moon', 'planet']).toContain(object.type);
        expect(object.coordinates.providerObjectId).toMatch(/^\d+$/);
        expect(object.magnitude).toBeNull();
      }
    }
  });
});

describe('StaticCatalogModel', () => {
  const model = new StaticCatalogModel();

  it('returns objects in catalog order up to the limit', async () => {
    const objects = await model.findMany({ limit: 3 });

    expect(objects.map((object) => object.id)).toEqual([
      'moon',
      'mercury',
      'venus',
    ]);
  });

  it.each([
    ['orion', ['orion']],
    ['ÓRION', ['orion']],
    ['cruzeiro', ['crux']],
    ['cruz do sul', ['crux']],
    ['jupiter', ['jupiter']],
    ['centauri', ['alpha-centauri', 'hadar']],
    ['sírius', ['sirius']],
  ])('finds %j by id, name or alias ignoring case and accents', async (term, ids) => {
    const objects = await model.findMany({ searchTerm: term, limit: 50 });

    expect(objects.map((object) => object.id)).toEqual(ids);
  });

  it('combines search and type filters', async () => {
    const objects = await model.findMany({
      searchTerm: 'a',
      type: 'constellation',
      limit: 50,
    });

    expect(objects.length).toBeGreaterThan(0);
    expect(objects.every((object) => object.type === 'constellation')).toBe(true);
  });

  it('returns copies that cannot change the catalog', async () => {
    const [first] = await model.findMany({ limit: 1 });
    first.aliases.push('changed');
    first.name = 'changed';

    const [again] = await model.findMany({ limit: 1 });

    expect(again.name).toBe('Lua');
    expect(again.aliases).toEqual(['Moon', 'Luna']);
  });

  it('finds an object by exact id', async () => {
    await expect(model.findById('vega')).resolves.toMatchObject({
      id: 'vega',
      type: 'star',
    });
    await expect(model.findById('Vega')).resolves.toBeNull();
    await expect(model.findById('pluto')).resolves.toBeNull();
  });
});
