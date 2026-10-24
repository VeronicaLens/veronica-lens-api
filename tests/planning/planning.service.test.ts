import { describe, expect, it } from 'vitest';

import {
  AstronomyProviderError,
  equatorialToHorizontal,
} from '../../src/modules/astronomy/index.js';
import { StaticCatalogModel } from '../../src/modules/catalog/catalog.model.js';
import { PlanningService } from '../../src/modules/planning/planning.service.js';
import {
  WeatherProviderError,
  type HourlyWeather,
  type WeatherForecastRequest,
} from '../../src/modules/weather/index.js';
import {
  createEphemerisProviderMock,
  createWeatherProviderMock,
} from '../helpers/mocks.js';

const HOUR_MS = 3_600_000;
const now = Date.parse('2026-06-01T12:00:00Z');
const observer = { latitudeDegrees: -22.9, longitudeDegrees: -47.06, elevationMeters: 0 };
// 19:00 to 05:00 in Campinas (UTC-3).
const night = {
  windowFrom: '2026-06-01T22:00:00Z',
  windowTo: '2026-06-02T08:00:00Z',
};

function hours(
  request: WeatherForecastRequest,
  cloudCoverAt: (instant: number) => number = () => 5,
): HourlyWeather[] {
  const result: HourlyWeather[] = [];

  for (let t = request.from.getTime(); t <= request.to.getTime(); t += HOUR_MS) {
    result.push({
      forecastAt: new Date(t).toISOString(),
      temperatureCelsius: 15,
      relativeHumidityPercent: 60,
      precipitationProbabilityPercent: 0,
      precipitationMillimeters: 0,
      cloudCoverPercent: cloudCoverAt(t),
      visibilityMeters: 24_000,
      windSpeedKilometersPerHour: 5,
    });
  }

  return result;
}

function setup() {
  const ephemeris = createEphemerisProviderMock();
  const weather = createWeatherProviderMock();

  weather.getHourlyForecast.mockImplementation(async (request) => ({
    gridLocation: { latitudeDegrees: -22.88, longitudeDegrees: -47.02, elevationMeters: 667 },
    hourly: hours(request),
  }));

  return {
    ephemeris,
    weather,
    service: new PlanningService(new StaticCatalogModel(), ephemeris, weather, () => now),
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    objectId: 'crux',
    observer,
    minimumAltitudeDegrees: 20,
    ...night,
    ...overrides,
  };
}

describe('PlanningService', () => {
  it('finds the Southern Cross culminating at about 52.9 degrees on a clear night', async () => {
    const { service, ephemeris } = setup();

    const result = await service.recommend(input());

    expect(result.status).toBe('recommended');
    expect(result.objectName).toBe('Cruzeiro do Sul');
    expect(result.weatherAvailable).toBe(true);
    expect(result.sampleIntervalMinutes).toBe(15);
    // 10 hours sampled every 15 minutes, both edges included.
    expect(result.samples).toHaveLength(41);
    expect(result.window?.peakAltitudeDegrees).toBeGreaterThan(52.4);
    expect(result.window?.peakAltitudeDegrees).toBeLessThan(53.4);
    expect(ephemeris.getApparentPosition).not.toHaveBeenCalled();
  });

  it('reports every sample below the minimum altitude', async () => {
    const { service } = setup();

    const result = await service.recommend(input({ minimumAltitudeDegrees: 80 }));

    expect(result.status).toBe('no_favorable_window');
    expect(result.window).toBeNull();
    expect(result.rejections.belowMinimumAltitude).toBe(41);
  });

  it('rejects an overcast night', async () => {
    const { service, weather } = setup();

    weather.getHourlyForecast.mockImplementation(async (request) => ({
      gridLocation: { latitudeDegrees: 0, longitudeDegrees: 0, elevationMeters: 0 },
      hourly: hours(request, () => 100),
    }));

    const result = await service.recommend(input());

    expect(result.status).toBe('no_favorable_window');
    expect(result.rejections.poorConditions).toBe(41);
    expect(result.samples.every((sample) => sample.rating === 'poor')).toBe(true);
  });

  it('picks the longest favorable stretch when clouds split the night', async () => {
    const { service, weather } = setup();
    const cloudsFrom = Date.parse('2026-06-02T01:00:00Z');
    const cloudsTo = Date.parse('2026-06-02T02:00:00Z');

    weather.getHourlyForecast.mockImplementation(async (request) => ({
      gridLocation: { latitudeDegrees: 0, longitudeDegrees: 0, elevationMeters: 0 },
      hourly: hours(request, (t) => (t >= cloudsFrom && t <= cloudsTo ? 100 : 5)),
    }));

    const result = await service.recommend(input({ minimumAltitudeDegrees: 0 }));

    const runs: { from: string; to: string; length: number }[] = [];
    for (const sample of result.samples) {
      const last = runs.at(-1);
      const previous = result.samples[result.samples.indexOf(sample) - 1];
      if (!sample.favorable) continue;
      if (last && previous?.favorable) {
        last.to = sample.at;
        last.length += 1;
      } else {
        runs.push({ from: sample.at, to: sample.at, length: 1 });
      }
    }
    const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));

    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(result.window).toMatchObject({ from: longest.from, to: longest.to });
  });

  it('plans with darkness only when the weather is unavailable', async () => {
    const { service, weather } = setup();

    weather.getHourlyForecast.mockRejectedValue(
      new WeatherProviderError('REJECTED', 'out of range'),
    );

    const result = await service.recommend(input());

    expect(result.weatherAvailable).toBe(false);
    expect(result.status).toBe('recommended');
    expect(result.samples.every((sample) => sample.rating === null)).toBe(true);
  });

  it('interpolates moving bodies from two Horizons positions across RA 0', async () => {
    const { service, ephemeris } = setup();
    const from = new Date(night.windowFrom);
    const to = new Date(night.windowTo);

    ephemeris.getApparentPosition.mockImplementation(async ({ observedAt }) => ({
      observedAt: observedAt.toISOString(),
      equatorial:
        observedAt.getTime() === from.getTime()
          ? { rightAscensionDegrees: 355, declinationDegrees: -10 }
          : { rightAscensionDegrees: 5, declinationDegrees: -12 },
      horizontal: { altitudeDegrees: 0, azimuthDegrees: 0 },
    }));

    const result = await service.recommend(input({ objectId: 'mars' }));

    expect(ephemeris.getApparentPosition.mock.calls.map(([r]) => [r.providerObjectId, r.observedAt])).toEqual([
      ['499', from],
      ['499', to],
    ]);

    const middle = result.samples[20];
    const expected = equatorialToHorizontal(
      { rightAscensionDegrees: 0, declinationDegrees: -11 },
      new Date(middle.at),
      observer,
    );

    expect(middle.at).toBe('2026-06-02T03:00:00.000Z');
    expect(middle.altitudeDegrees).toBeCloseTo(expected.altitudeDegrees, 6);
  });

  it('returns 503 when Horizons fails for a moving body', async () => {
    const { service, ephemeris } = setup();

    ephemeris.getApparentPosition.mockRejectedValue(
      new AstronomyProviderError('UNAVAILABLE', 'down'),
    );

    await expect(service.recommend(input({ objectId: 'moon' }))).rejects.toMatchObject({
      statusCode: 503,
      code: 'PLANNING_UNAVAILABLE',
    });
  });

  it('returns 404 for an unknown object', async () => {
    const { service } = setup();

    await expect(service.recommend(input({ objectId: 'pluto' }))).rejects.toMatchObject({
      statusCode: 404,
      code: 'CELESTIAL_OBJECT_NOT_FOUND',
    });
  });

  it.each([
    ['starting more than an hour ago', '2026-06-01T10:59:00Z', '2026-06-01T12:00:00Z'],
    ['ending beyond one year', '2027-06-02T22:00:00Z', '2027-06-03T08:00:00Z'],
  ])('rejects windows %s', async (_name, windowFrom, windowTo) => {
    const { service } = setup();

    await expect(service.recommend(input({ windowFrom, windowTo }))).rejects.toMatchObject({
      statusCode: 400,
      code: 'OBSERVATION_TIME_OUT_OF_RANGE',
    });
  });
});
