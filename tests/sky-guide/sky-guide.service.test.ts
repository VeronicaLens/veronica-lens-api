import { describe, expect, it } from 'vitest';

import { StaticCatalogModel } from '../../src/modules/catalog/catalog.model.js';
import { SkyGuideService } from '../../src/modules/sky-guide/sky-guide.service.js';
import { createEphemerisProviderMock } from '../helpers/mocks.js';

const now = Date.parse('2026-06-01T00:00:00Z');
const day = 24 * 60 * 60 * 1_000;
const observer = {
  latitudeDegrees: -22.9,
  longitudeDegrees: -47.06,
  elevationMeters: 0,
};

function setup() {
  return new SkyGuideService(
    new StaticCatalogModel(),
    createEphemerisProviderMock(),
    () => now,
  );
}

describe('SkyGuideService time range', () => {
  it.each([
    ['now', undefined],
    ['365 days ahead', new Date(now + 365 * day).toISOString()],
    ['365 days ago', new Date(now - 365 * day).toISOString()],
  ])('accepts %s', async (_name, observedAt) => {
    await expect(
      setup().getPositions({ objectIds: ['vega'], observedAt, observer }),
    ).resolves.toMatchObject({ positions: [{ id: 'vega' }] });
  });

  it.each([
    new Date(now + 367 * day).toISOString(),
    new Date(now - 367 * day).toISOString(),
  ])('rejects %s', async (observedAt) => {
    await expect(
      setup().getPositions({ objectIds: ['vega'], observedAt, observer }),
    ).rejects.toMatchObject({ code: 'OBSERVATION_TIME_OUT_OF_RANGE' });
  });
});
