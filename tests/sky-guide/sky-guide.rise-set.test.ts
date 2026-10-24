import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { AstronomyProviderError } from '../../src/modules/astronomy/index.js';
import { createAppMocks } from '../helpers/mocks.js';

const endpoint = '/api/v1/sky-guide/rise-set';
const bearer = 'Bearer test-access-token';
const observer = { latitudeDegrees: -22.9, longitudeDegrees: -47.06 };
const DAY_MS = 24 * 60 * 60 * 1_000;

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
  mocks.ephemerisProvider.getRiseTransitSet.mockImplementation(async ({ from }) => [
    { type: 'set', at: new Date(from.getTime() + 2 * 3_600_000).toISOString(), azimuthDegrees: 250, altitudeDegrees: -1.6 },
    { type: 'rise', at: new Date(from.getTime() + 14 * 3_600_000).toISOString(), azimuthDegrees: 110, altitudeDegrees: -1.5 },
  ]);

  return { ...mocks, app: createApp(mocks) };
}

describe('POST /api/v1/sky-guide/rise-set', () => {
  it('combines Horizons events for the Moon with analytic events for stars', async () => {
    const { app, ephemerisProvider } = setup();
    const from = new Date(Date.now() + 3_600_000).toISOString();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['moon', 'sirius'], observer, from })
      .expect(200);

    const { data } = response.body;

    expect(data.from).toBe(from);
    expect(Date.parse(data.to) - Date.parse(data.from)).toBe(DAY_MS);
    expect(data.unavailable).toEqual([]);
    expect(data.objects[0]).toMatchObject({
      id: 'moon',
      name: 'Lua',
      type: 'moon',
      horizon: 'rises-and-sets',
    });
    expect(data.objects[0].events.map((e: { type: string }) => e.type)).toEqual(['set', 'rise']);
    expect(data.objects[1]).toMatchObject({ id: 'sirius', horizon: 'rises-and-sets' });
    expect(data.objects[1].events).toHaveLength(3);

    expect(ephemerisProvider.getRiseTransitSet).toHaveBeenCalledExactlyOnceWith({
      providerObjectId: '301',
      from: new Date(from),
      to: new Date(Date.parse(from) + DAY_MS),
      observer: { ...observer, elevationMeters: 0 },
    });
  });

  it.each([
    [[{ type: 'transit', altitudeDegrees: 30 }], 'always-above'],
    [[{ type: 'transit', altitudeDegrees: -10 }], 'always-below'],
    [[], null],
  ])('infers the horizon status of moving bodies from %j', async (events, horizon) => {
    const { app, ephemerisProvider } = setup();

    ephemerisProvider.getRiseTransitSet.mockResolvedValue(
      events.map((event) => ({ ...event, at: new Date().toISOString(), azimuthDegrees: 0 })) as never,
    );

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['jupiter'], observer })
      .expect(200);

    expect(response.body.data.objects[0].horizon).toBe(horizon);
  });

  it('reports unknown objects and provider failures without failing the request', async () => {
    const { app, ephemerisProvider } = setup();

    ephemerisProvider.getRiseTransitSet.mockRejectedValue(
      new AstronomyProviderError('UNAVAILABLE', 'Internal details'),
    );

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['moon', 'pluto', 'vega'], observer })
      .expect(200);

    expect(response.body.data.objects.map((o: { id: string }) => o.id)).toEqual(['vega']);
    expect(response.body.data.unavailable).toEqual([
      { id: 'moon', reason: 'PROVIDER_UNAVAILABLE' },
      { id: 'pluto', reason: 'NOT_FOUND' },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('Internal details');
  });

  it.each([
    ['too many objects', { objectIds: Array.from({ length: 11 }, (_, i) => `o${i}`), observer }],
    ['missing observer', { objectIds: ['moon'] }],
    ['date without offset', { objectIds: ['moon'], observer, from: '2026-06-01T00:00:00' }],
    ['unknown field', { objectIds: ['moon'], observer, to: new Date().toISOString() }],
  ])('rejects %s', async (_name, body) => {
    const { app, ephemerisProvider } = setup();

    await request(app).post(endpoint).set('Authorization', bearer).send(body).expect(400);
    expect(ephemerisProvider.getRiseTransitSet).not.toHaveBeenCalled();
  });

  it('rejects windows more than one year away', async () => {
    const { app } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectIds: ['moon'], observer, from: new Date(Date.now() + 400 * DAY_MS).toISOString() })
      .expect(400);

    expect(response.body.error.code).toBe('OBSERVATION_TIME_OUT_OF_RANGE');
  });

  it('requires authentication', async () => {
    const { app } = setup();

    await request(app).post(endpoint).send({ objectIds: ['moon'], observer }).expect(401);
  });
});
