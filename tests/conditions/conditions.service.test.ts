import { describe, expect, it } from 'vitest';

import { sunHorizontal } from '../../src/modules/astronomy/index.js';
import { ConditionsService } from '../../src/modules/conditions/conditions.service.js';
import {
  WeatherProviderError,
  type HourlyWeather,
  type WeatherForecastRequest,
} from '../../src/modules/weather/index.js';
import { createWeatherProviderMock } from '../helpers/mocks.js';

const HOUR_MS = 3_600_000;
const now = Date.parse('2026-06-01T00:20:00Z');
const observer = {
  latitudeDegrees: -22.9,
  longitudeDegrees: -47.06,
  elevationMeters: 0,
};

function hoursFor(request: WeatherForecastRequest): HourlyWeather[] {
  const hours: HourlyWeather[] = [];

  for (let t = request.from.getTime(); t <= request.to.getTime(); t += HOUR_MS) {
    hours.push({
      forecastAt: new Date(t).toISOString(),
      temperatureCelsius: 18,
      relativeHumidityPercent: 60,
      precipitationProbabilityPercent: 0,
      precipitationMillimeters: 0,
      cloudCoverPercent: 5,
      visibilityMeters: 24_000,
      windSpeedKilometersPerHour: 6,
    });
  }

  return hours;
}

function setup() {
  const weather = createWeatherProviderMock();

  weather.getHourlyForecast.mockImplementation(async (request) => ({
    gridLocation: { latitudeDegrees: -22.88, longitudeDegrees: -47.02, elevationMeters: 667 },
    hourly: hoursFor(request),
  }));

  return { weather, service: new ConditionsService(weather, () => now) };
}

describe('ConditionsService.getCurrent', () => {
  it('uses the closest forecast hour and the Sun at the exact instant', async () => {
    const { weather, service } = setup();

    const result = await service.getCurrent({ observer });

    expect(weather.getHourlyForecast).toHaveBeenCalledExactlyOnceWith({
      latitudeDegrees: -22.9,
      longitudeDegrees: -47.06,
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result.requestedAt).toBe('2026-06-01T00:20:00.000Z');
    expect(result.conditions.forecastAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result.conditions.sunAltitudeDegrees).toBeCloseTo(
      sunHorizontal(new Date(now), observer).altitudeDegrees,
      10,
    );
    // 21:20 in Campinas: dark and clear.
    expect(result.conditions.rating).toBe('good');
    expect(result.conditions.weather).not.toHaveProperty('forecastAt');
  });

  it('rounds to the next hour after the half hour', async () => {
    const { weather, service } = setup();

    await service.getCurrent({ observer, at: '2026-06-01T05:31:00Z' });

    expect(weather.getHourlyForecast.mock.calls[0][0].from).toEqual(
      new Date('2026-06-01T06:00:00Z'),
    );
  });

  it.each([
    ['one hour ago', now - HOUR_MS, true],
    ['seven days ahead', now + 7 * 24 * HOUR_MS, true],
    ['more than one hour ago', now - HOUR_MS - 1, false],
    ['beyond seven days', now + 7 * 24 * HOUR_MS + 1, false],
  ])('handles %s', async (_name, instant, accepted) => {
    const { service } = setup();
    const call = service.getCurrent({ observer, at: new Date(instant).toISOString() });

    if (accepted) {
      await expect(call).resolves.toBeDefined();
    } else {
      await expect(call).rejects.toMatchObject({
        statusCode: 400,
        code: 'OBSERVATION_TIME_OUT_OF_RANGE',
      });
    }
  });

  it('returns 503 when the forecast lacks the hour', async () => {
    const { weather, service } = setup();

    weather.getHourlyForecast.mockResolvedValue({
      gridLocation: { latitudeDegrees: 0, longitudeDegrees: 0, elevationMeters: 0 },
      hourly: [],
    });

    await expect(service.getCurrent({ observer })).rejects.toMatchObject({
      statusCode: 503,
      code: 'CONDITIONS_UNAVAILABLE',
    });
  });

  it.each(['UNAVAILABLE', 'INVALID_RESPONSE', 'REJECTED'] as const)(
    'maps weather provider error %s to 503',
    async (code) => {
      const { weather, service } = setup();

      weather.getHourlyForecast.mockRejectedValue(
        new WeatherProviderError(code, 'Internal details'),
      );

      await expect(service.getCurrent({ observer })).rejects.toMatchObject({
        statusCode: 503,
        code: 'CONDITIONS_UNAVAILABLE',
      });
    },
  );

  it('does not hide unexpected errors', async () => {
    const { weather, service } = setup();
    const bug = new TypeError('bug');

    weather.getHourlyForecast.mockRejectedValue(bug);

    await expect(service.getCurrent({ observer })).rejects.toBe(bug);
  });
});

describe('ConditionsService.getForecast', () => {
  it('assesses every hour of the next seven days', async () => {
    const { weather, service } = setup();

    const result = await service.getForecast({ observer });

    expect(result.from).toBe('2026-06-01T01:00:00.000Z');
    expect(result.to).toBe('2026-06-08T00:00:00.000Z');
    expect(result.hours).toHaveLength(168);
    expect(weather.getHourlyForecast).toHaveBeenCalledOnce();

    const noon = result.hours.find((h) => h.forecastAt === '2026-06-01T15:00:00.000Z');
    const night = result.hours.find((h) => h.forecastAt === '2026-06-02T03:00:00.000Z');

    expect(noon?.rating).toBe('poor');
    expect(noon?.factors[0]).toEqual({ code: 'darkness', status: 'poor' });
    expect(night?.rating).toBe('good');
  });

  it('returns 503 when the provider returns no hours', async () => {
    const { weather, service } = setup();

    weather.getHourlyForecast.mockResolvedValue({
      gridLocation: { latitudeDegrees: 0, longitudeDegrees: 0, elevationMeters: 0 },
      hourly: [],
    });

    await expect(service.getForecast({ observer })).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
