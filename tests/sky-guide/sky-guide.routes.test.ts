import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import {
  AstronomyProviderError,
  equatorialToHorizontal,
} from '../../src/modules/astronomy/index.js';
import { createAppMocks } from '../helpers/mocks.js';

const endpoint = '/api/v1/sky-guide/positions';
const bearer = 'Bearer test-access-token';
const observer = {
  latitudeDegrees: -22.9,
  longitudeDegrees: -47.06,
  elevationMeters: 600,
};

function createUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function setup() {
  const mocks = createAppMocks();

  mocks.authModel.getUser.mockResolvedValue({ user: createUser(), error: null });
  mocks.ephemerisProvider.getApparentPosition.mockImplementation(
    async ({ observedAt }) => ({
      observedAt: observedAt.toISOString(),
      equatorial: { rightAscensionDegrees: 256.6, declinationDegrees: -27.6 },
      horizontal: { altitudeDegrees: 41.1, azimuthDegrees: 107.4 },
    }),
  );

  return { ...mocks, app: createApp(mocks) };
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

describe('POST /api/v1/sky-guide/positions', () => {
  it('combines local positions for stars with Horizons for moving bodies', async () => {
    const { app, ephemerisProvider } = setup();
    const observedAt = hoursFromNow(2);

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['moon', 'sirius'], observedAt, observer })
      .expect(200);

    const expectedSirius = equatorialToHorizontal(
      { rightAscensionDegrees: 101.287155, declinationDegrees: -16.716116 },
      new Date(observedAt),
      observer,
    );

    expect(response.body.data).toEqual({
      observedAt,
      positions: [
        {
          id: 'moon',
          name: 'Lua',
          type: 'moon',
          magnitude: null,
          horizontal: { altitudeDegrees: 41.1, azimuthDegrees: 107.4 },
          aboveHorizon: true,
        },
        {
          id: 'sirius',
          name: 'Sirius',
          type: 'star',
          magnitude: -1.46,
          horizontal: expectedSirius,
          aboveHorizon: expectedSirius.altitudeDegrees > 0,
        },
      ],
      unavailable: [],
    });
    expect(ephemerisProvider.getApparentPosition).toHaveBeenCalledExactlyOnceWith({
      providerObjectId: '301',
      observedAt: new Date(observedAt),
      observer,
    });
  });

  it('uses the current time and sea level by default', async () => {
    const { app } = setup();
    const before = Date.now();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({
        objectIds: ['vega'],
        observer: { latitudeDegrees: 10, longitudeDegrees: 20 },
      })
      .expect(200);

    const observedAt = Date.parse(response.body.data.observedAt);

    expect(observedAt).toBeGreaterThanOrEqual(before);
    expect(observedAt).toBeLessThanOrEqual(Date.now());
    expect(response.body.data.positions).toHaveLength(1);
  });

  it('accepts offsets and normalizes the instant to UTC', async () => {
    const { app } = setup();
    const utc = new Date(Date.now() + 3_600_000);
    utc.setUTCMilliseconds(0);
    const local = new Date(utc.getTime() - 3 * 3_600_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, '-03:00');

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['vega'], observedAt: local, observer })
      .expect(200);

    expect(response.body.data.observedAt).toBe(utc.toISOString());
  });

  it('reports unknown ids and provider failures without failing the request', async () => {
    const { app, ephemerisProvider } = setup();

    ephemerisProvider.getApparentPosition.mockRejectedValue(
      new AstronomyProviderError('UNAVAILABLE', 'Internal provider details'),
    );

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['mars', 'pluto', 'vega'], observer })
      .expect(200);

    expect(response.body.data.positions.map((p: { id: string }) => p.id)).toEqual([
      'vega',
    ]);
    expect(response.body.data.unavailable).toEqual([
      { id: 'mars', reason: 'PROVIDER_UNAVAILABLE' },
      { id: 'pluto', reason: 'NOT_FOUND' },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('Internal provider details');
  });

  it('removes duplicate ids and keeps the requested order', async () => {
    const { app, ephemerisProvider } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['vega', 'moon', 'vega', 'moon'], observer })
      .expect(200);

    expect(response.body.data.positions.map((p: { id: string }) => p.id)).toEqual([
      'vega',
      'moon',
    ]);
    expect(ephemerisProvider.getApparentPosition).toHaveBeenCalledOnce();
  });

  it('returns 500 for unexpected errors instead of hiding them', async () => {
    const { app, ephemerisProvider } = setup();

    ephemerisProvider.getApparentPosition.mockRejectedValue(new Error('bug'));

    await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['moon'], observer })
      .expect(500);
  });

  it.each([
    ['missing ids', { observer }],
    ['empty ids', { objectIds: [], observer }],
    ['too many ids', { objectIds: Array.from({ length: 21 }, (_, i) => `o${i}`), observer }],
    ['malformed id', { objectIds: ['../etc'], observer }],
    ['missing observer', { objectIds: ['moon'] }],
    ['latitude out of range', { objectIds: ['moon'], observer: { ...observer, latitudeDegrees: 91 } }],
    ['longitude as string', { objectIds: ['moon'], observer: { ...observer, longitudeDegrees: '-47' } }],
    ['elevation too high', { objectIds: ['moon'], observer: { ...observer, elevationMeters: 9_001 } }],
    ['date without offset', { objectIds: ['moon'], observer, observedAt: '2026-06-01T00:00:00' }],
    ['unknown field', { objectIds: ['moon'], observer, extra: true }],
    ['unknown observer field', { objectIds: ['moon'], observer: { ...observer, accuracy: 5 } }],
  ])('rejects %s', async (_name, body) => {
    const { app, ephemerisProvider } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(ephemerisProvider.getApparentPosition).not.toHaveBeenCalled();
  });

  it('rejects instants more than one year away', async () => {
    const { app } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['moon'], observer, observedAt: hoursFromNow(24 * 400) })
      .expect(400);

    expect(response.body.error.code).toBe('OBSERVATION_TIME_OUT_OF_RANGE');
  });

  it('requires authentication', async () => {
    const { app, ephemerisProvider } = setup();

    await request(app)
      .post(endpoint)
      .send({ objectIds: ['moon'], observer })
      .expect(401);

    expect(ephemerisProvider.getApparentPosition).not.toHaveBeenCalled();
  });
});
