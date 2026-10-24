import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createAppMocks } from '../helpers/mocks.js';

const endpoint = '/api/v1/planning/recommendation';
const bearer = 'Bearer test-access-token';
const HOUR_MS = 3_600_000;
const observer = { latitudeDegrees: -22.9, longitudeDegrees: -47.06 };

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
  mocks.weatherProvider.getHourlyForecast.mockResolvedValue({
    gridLocation: { latitudeDegrees: 0, longitudeDegrees: 0, elevationMeters: 0 },
    hourly: [],
  });

  return { ...mocks, app: createApp(mocks) };
}

function window(startHours: number, durationHours: number) {
  const from = Date.now() + startHours * HOUR_MS;

  return {
    windowFrom: new Date(from).toISOString(),
    windowTo: new Date(from + durationHours * HOUR_MS).toISOString(),
  };
}

describe('POST /api/v1/planning/recommendation', () => {
  it('returns a recommendation envelope with samples', async () => {
    const { app } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectId: 'vega', observer, ...window(1, 6) })
      .expect(200);

    const data = response.body.data;

    expect(data).toMatchObject({
      objectId: 'vega',
      objectName: 'Vega',
      minimumAltitudeDegrees: 20,
      sampleIntervalMinutes: 15,
      weatherAvailable: true,
    });
    expect(['recommended', 'no_favorable_window']).toContain(data.status);
    expect(data.samples).toHaveLength(25);
    expect(data.samples[0]).toEqual({
      at: expect.any(String),
      altitudeDegrees: expect.any(Number),
      sunAltitudeDegrees: expect.any(Number),
      rating: null,
      favorable: expect.any(Boolean),
    });
  });

  it.each([
    ['window over 24 hours', { objectId: 'vega', observer, ...window(1, 25) }],
    ['window ending before it starts', { objectId: 'vega', observer, ...window(1, -1) }],
    ['empty window', { objectId: 'vega', observer, ...window(1, 0) }],
    ['minimum altitude too high', { objectId: 'vega', observer, ...window(1, 2), minimumAltitudeDegrees: 81 }],
    ['negative minimum altitude', { objectId: 'vega', observer, ...window(1, 2), minimumAltitudeDegrees: -1 }],
    ['missing observer', { objectId: 'vega', ...window(1, 2) }],
    ['malformed object id', { objectId: 'Vega!', observer, ...window(1, 2) }],
    ['unknown field', { objectId: 'vega', observer, ...window(1, 2), extra: 1 }],
  ])('rejects %s', async (_name, body) => {
    const { app, weatherProvider } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(weatherProvider.getHourlyForecast).not.toHaveBeenCalled();
  });

  it('returns 404 for an object outside the catalog', async () => {
    const { app } = setup();

    const response = await request(app)
      .post(endpoint)
      .set('Authorization', bearer)
      .send({ objectId: 'pluto', observer, ...window(1, 2) })
      .expect(404);

    expect(response.body.error.code).toBe('CELESTIAL_OBJECT_NOT_FOUND');
  });

  it('requires authentication', async () => {
    const { app } = setup();

    await request(app)
      .post(endpoint)
      .send({ objectId: 'vega', observer, ...window(1, 2) })
      .expect(401);
  });
});
