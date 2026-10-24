import { describe, expect, it } from 'vitest';

import { assessConditions } from '../../src/modules/conditions/conditions.assessment.js';
import type { HourlyWeather } from '../../src/modules/weather/index.js';

const clearNight: Omit<HourlyWeather, 'forecastAt'> = {
  temperatureCelsius: 18,
  relativeHumidityPercent: 60,
  precipitationProbabilityPercent: 0,
  precipitationMillimeters: 0,
  cloudCoverPercent: 5,
  visibilityMeters: 24_000,
  windSpeedKilometersPerHour: 6,
};
const NIGHT = -30;

function statusOf(
  weather: Partial<typeof clearNight>,
  code: string,
  sunAltitude = NIGHT,
) {
  return assessConditions({ ...clearNight, ...weather }, sunAltitude).factors.find(
    (factor) => factor.code === code,
  )?.status;
}

describe('assessConditions', () => {
  it('rates a clear, dark, calm night as good', () => {
    const result = assessConditions(clearNight, NIGHT);

    expect(result.rating).toBe('good');
    expect(result.factors.map((f) => f.code)).toEqual([
      'darkness',
      'cloud-cover',
      'precipitation',
      'visibility',
      'wind',
      'humidity',
    ]);
    expect(result.factors.every((f) => f.status === 'good')).toBe(true);
  });

  it.each([
    [-18.1, 'good'],
    [-18, 'good'],
    [-17.9, 'caution'],
    [-6, 'caution'],
    [-5.9, 'poor'],
    [45, 'poor'],
  ])('rates darkness with the Sun at %s degrees as %s', (altitude, status) => {
    expect(statusOf({}, 'darkness', altitude)).toBe(status);
  });

  it.each([
    ['cloud-cover', { cloudCoverPercent: 20 }, 'good'],
    ['cloud-cover', { cloudCoverPercent: 21 }, 'caution'],
    ['cloud-cover', { cloudCoverPercent: 61 }, 'poor'],
    ['visibility', { visibilityMeters: 10_000 }, 'good'],
    ['visibility', { visibilityMeters: 9_999 }, 'caution'],
    ['visibility', { visibilityMeters: 4_999 }, 'poor'],
    ['wind', { windSpeedKilometersPerHour: 15 }, 'good'],
    ['wind', { windSpeedKilometersPerHour: 30 }, 'caution'],
    ['wind', { windSpeedKilometersPerHour: 31 }, 'poor'],
    ['humidity', { relativeHumidityPercent: 80 }, 'good'],
    ['humidity', { relativeHumidityPercent: 90 }, 'caution'],
    ['humidity', { relativeHumidityPercent: 91 }, 'poor'],
  ])('rates %s %j as %s', (code, weather, status) => {
    expect(statusOf(weather, code)).toBe(status);
  });

  it.each([
    [{ precipitationProbabilityPercent: 10, precipitationMillimeters: 0 }, 'good'],
    [{ precipitationProbabilityPercent: 25, precipitationMillimeters: 0 }, 'caution'],
    [{ precipitationProbabilityPercent: 0, precipitationMillimeters: 0.5 }, 'caution'],
    [{ precipitationProbabilityPercent: 0, precipitationMillimeters: 2 }, 'poor'],
    [{ precipitationProbabilityPercent: 80, precipitationMillimeters: 0 }, 'poor'],
    [{ precipitationProbabilityPercent: null, precipitationMillimeters: 0 }, 'good'],
    [{ precipitationProbabilityPercent: 50, precipitationMillimeters: null }, 'poor'],
    [{ precipitationProbabilityPercent: null, precipitationMillimeters: null }, 'unknown'],
  ])('combines precipitation %j into %s', (weather, status) => {
    expect(statusOf(weather, 'precipitation')).toBe(status);
  });

  it('marks missing weather values as unknown and never rates them good', () => {
    const result = assessConditions({ ...clearNight, visibilityMeters: null }, NIGHT);

    expect(result.factors.find((f) => f.code === 'visibility')?.status).toBe('unknown');
    expect(result.rating).toBe('fair');
  });

  it('rates daytime as poor even with a clear sky', () => {
    expect(assessConditions(clearNight, 30).rating).toBe('poor');
  });

  it('rates twilight as fair', () => {
    expect(assessConditions(clearNight, -10).rating).toBe('fair');
  });

  it('does not let humidity alone make the sky poor', () => {
    expect(
      assessConditions({ ...clearNight, relativeHumidityPercent: 99 }, NIGHT).rating,
    ).toBe('fair');
  });

  it.each([
    { cloudCoverPercent: 90 },
    { precipitationMillimeters: 3 },
    { visibilityMeters: 1_000 },
    { windSpeedKilometersPerHour: 50 },
  ])('rates the sky poor when a critical factor is poor: %j', (weather) => {
    expect(assessConditions({ ...clearNight, ...weather }, NIGHT).rating).toBe('poor');
  });
});
