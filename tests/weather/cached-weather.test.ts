import { describe, expect, it, vi } from 'vitest';

import { CachedWeatherProvider } from '../../src/modules/weather/cached-weather.js';
import type {
  HourlyWeather,
  WeatherForecastRequest,
  WeatherProviderPort,
} from '../../src/modules/weather/weather.types.js';

const HOUR_MS = 3_600_000;

function hoursOf(request: WeatherForecastRequest): HourlyWeather[] {
  const hours: HourlyWeather[] = [];

  for (let t = request.from.getTime(); t <= request.to.getTime(); t += HOUR_MS) {
    hours.push({
      forecastAt: new Date(t).toISOString(),
      temperatureCelsius: 20,
      relativeHumidityPercent: 50,
      precipitationProbabilityPercent: 0,
      precipitationMillimeters: 0,
      cloudCoverPercent: 10,
      visibilityMeters: 20_000,
      windSpeedKilometersPerHour: 5,
    });
  }

  return hours;
}

function setup() {
  let now = 0;
  const inner = {
    getHourlyForecast: vi.fn<WeatherProviderPort['getHourlyForecast']>(
      async (request) => ({
        gridLocation: {
          latitudeDegrees: request.latitudeDegrees,
          longitudeDegrees: request.longitudeDegrees,
          elevationMeters: 600,
        },
        hourly: hoursOf(request),
      }),
    ),
  };

  return {
    inner,
    cache: new CachedWeatherProvider(inner, {
      ttlMs: 1_000,
      maxEntries: 2,
      now: () => now,
    }),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const evening = {
  latitudeDegrees: -22.90012,
  longitudeDegrees: -47.06044,
  from: new Date('2026-10-24T21:00:00Z'),
  to: new Date('2026-10-24T23:00:00Z'),
};

describe('CachedWeatherProvider', () => {
  it('asks for whole UTC days at ~1 km and returns only the requested hours', async () => {
    const { inner, cache } = setup();

    const forecast = await cache.getHourlyForecast(evening);

    expect(inner.getHourlyForecast).toHaveBeenCalledExactlyOnceWith({
      latitudeDegrees: -22.9,
      longitudeDegrees: -47.06,
      from: new Date('2026-10-24T00:00:00Z'),
      to: new Date('2026-10-24T23:59:59.999Z'),
    });
    expect(forecast.hourly.map((hour) => hour.forecastAt)).toEqual([
      '2026-10-24T21:00:00.000Z',
      '2026-10-24T22:00:00.000Z',
      '2026-10-24T23:00:00.000Z',
    ]);
  });

  it('serves other windows of the same day and nearby users from one request', async () => {
    const { inner, cache } = setup();

    await cache.getHourlyForecast(evening);
    const morning = await cache.getHourlyForecast({
      latitudeDegrees: -22.9031,
      longitudeDegrees: -47.0571,
      from: new Date('2026-10-24T06:00:00Z'),
      to: new Date('2026-10-24T07:00:00Z'),
    });

    expect(morning.hourly).toHaveLength(2);
    expect(inner.getHourlyForecast).toHaveBeenCalledOnce();
  });

  it('spans every UTC day touched by the window', async () => {
    const { inner, cache } = setup();

    await cache.getHourlyForecast({
      ...evening,
      to: new Date('2026-10-25T02:00:00Z'),
    });

    expect(inner.getHourlyForecast.mock.calls[0][0]).toMatchObject({
      from: new Date('2026-10-24T00:00:00Z'),
      to: new Date('2026-10-25T23:59:59.999Z'),
    });
  });

  it('shares in-flight requests and does not cache failures', async () => {
    const { inner, cache } = setup();

    await Promise.all([
      cache.getHourlyForecast(evening),
      cache.getHourlyForecast(evening),
    ]);
    expect(inner.getHourlyForecast).toHaveBeenCalledOnce();

    inner.getHourlyForecast.mockRejectedValueOnce(new Error('down'));
    const otherDay = { ...evening, from: new Date('2026-10-26T21:00:00Z'), to: new Date('2026-10-26T22:00:00Z') };

    await expect(cache.getHourlyForecast(otherDay)).rejects.toThrow('down');
    await expect(cache.getHourlyForecast(otherDay)).resolves.toBeDefined();
  });

  it('expires entries and evicts the oldest when full', async () => {
    const { inner, cache, advance } = setup();

    await cache.getHourlyForecast(evening);
    advance(1_001);
    await cache.getHourlyForecast(evening);
    expect(inner.getHourlyForecast).toHaveBeenCalledTimes(2);

    await cache.getHourlyForecast({ ...evening, latitudeDegrees: 10 });
    await cache.getHourlyForecast({ ...evening, latitudeDegrees: 20 });
    expect(cache.size).toBe(2);
  });
});
