import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { WeatherProviderError } from '../../src/modules/weather/index.js';
import { createAppMocks } from '../helpers/mocks.js';

const bearer = 'Bearer test-access-token';
const observer = { latitudeDegrees: -22.9, longitudeDegrees: -47.06 };
const HOUR_MS = 3_600_000;

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
  mocks.weatherProvider.getHourlyForecast.mockImplementation(async ({ from, to }) => {
    const hourly = [];
    for (let t = from.getTime(); t <= to.getTime(); t += HOUR_MS) {
      hourly.push({
        forecastAt: new Date(t).toISOString(),
        temperatureCelsius: 18,
        relativeHumidityPercent: 95,
        precipitationProbabilityPercent: null,
        precipitationMillimeters: 0,
        cloudCoverPercent: 40,
        visibilityMeters: 20_000,
        windSpeedKilometersPerHour: 6,
      });
    }
    return {
      gridLocation: { latitudeDegrees: -22.88, longitudeDegrees: -47.02, elevationMeters: 667 },
      hourly,
    };
  });

  return { ...mocks, app: createApp(mocks) };
}

describe('POST /api/v1/conditions/current', () => {
  it('returns codes and numbers for the closest hour', async () => {
    const { app } = setup();

    const response = await request(app)
      .post('/api/v1/conditions/current')
      .set('Authorization', bearer)
      .send({ observer })
      .expect(200);

    const { requestedAt, conditions } = response.body.data;

    expect(Math.abs(Date.parse(requestedAt) - Date.now())).toBeLessThan(5_000);
    expect(conditions.forecastAt).toMatch(/T\d{2}:00:00\.000Z$/);
    expect(typeof conditions.sunAltitudeDegrees).toBe('number');
    expect(conditions.weather).toEqual({
      temperatureCelsius: 18,
      relativeHumidityPercent: 95,
      precipitationProbabilityPercent: null,
      precipitationMillimeters: 0,
      cloudCoverPercent: 40,
      visibilityMeters: 20_000,
      windSpeedKilometersPerHour: 6,
    });
    expect(conditions.factors.slice(1)).toEqual([
      { code: 'cloud-cover', status: 'caution' },
      { code: 'precipitation', status: 'good' },
      { code: 'visibility', status: 'good' },
      { code: 'wind', status: 'good' },
      { code: 'humidity', status: 'poor' },
    ]);
    expect(['fair', 'poor']).toContain(conditions.rating);
  });

  it('returns 503 without provider details when the weather fails', async () => {
    const { app, weatherProvider } = setup();

    weatherProvider.getHourlyForecast.mockRejectedValue(
      new WeatherProviderError('UNAVAILABLE', 'Internal provider details'),
    );

    const response = await request(app)
      .post('/api/v1/conditions/current')
      .set('Authorization', bearer)
      .send({ observer })
      .expect(503);

    expect(response.body.error.code).toBe('CONDITIONS_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('Internal provider details');
  });

  it.each([
    ['missing observer', {}],
    ['latitude out of range', { observer: { ...observer, latitudeDegrees: 91 } }],
    ['coordinates as strings', { observer: { latitudeDegrees: '-22.9', longitudeDegrees: '-47' } }],
    ['date without offset', { observer, at: '2026-06-01T00:00:00' }],
    ['unknown field', { observer, extra: 1 }],
  ])('rejects %s', async (_name, body) => {
    const { app, weatherProvider } = setup();

    await request(app)
      .post('/api/v1/conditions/current')
      .set('Authorization', bearer)
      .send(body)
      .expect(400);

    expect(weatherProvider.getHourlyForecast).not.toHaveBeenCalled();
  });

  it('rejects instants beyond seven days', async () => {
    const { app } = setup();

    const response = await request(app)
      .post('/api/v1/conditions/current')
      .set('Authorization', bearer)
      .send({ observer, at: new Date(Date.now() + 8 * 24 * HOUR_MS).toISOString() })
      .expect(400);

    expect(response.body.error.code).toBe('OBSERVATION_TIME_OUT_OF_RANGE');
  });

  it('requires authentication', async () => {
    const { app, weatherProvider } = setup();

    await request(app).post('/api/v1/conditions/current').send({ observer }).expect(401);
    expect(weatherProvider.getHourlyForecast).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/conditions/forecast', () => {
  it('returns 168 hourly assessments', async () => {
    const { app } = setup();

    const response = await request(app)
      .post('/api/v1/conditions/forecast')
      .set('Authorization', bearer)
      .send({ observer })
      .expect(200);

    expect(response.body.data.hours).toHaveLength(168);
    expect(Date.parse(response.body.data.to) - Date.parse(response.body.data.from)).toBe(
      167 * HOUR_MS,
    );
  });

  it('rejects an instant field and requires authentication', async () => {
    const { app } = setup();

    await request(app)
      .post('/api/v1/conditions/forecast')
      .set('Authorization', bearer)
      .send({ observer, at: new Date().toISOString() })
      .expect(400);
    await request(app).post('/api/v1/conditions/forecast').send({ observer }).expect(401);
  });
});
