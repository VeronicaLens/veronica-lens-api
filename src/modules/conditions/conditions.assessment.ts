import type { HourlyWeather } from '../weather/index.js';

export type FactorStatus = 'good' | 'caution' | 'poor' | 'unknown';

export type FactorCode =
  | 'darkness'
  | 'cloud-cover'
  | 'precipitation'
  | 'visibility'
  | 'wind'
  | 'humidity';

export type ObservationRating = 'good' | 'fair' | 'poor';

export interface ConditionFactor {
  code: FactorCode;
  status: FactorStatus;
}

export interface ConditionsAssessment {
  rating: ObservationRating;
  factors: ConditionFactor[];
}

// Humidity only risks dew on equipment; it never makes the sky unusable.
const CRITICAL_FACTORS = new Set<FactorCode>([
  'darkness',
  'cloud-cover',
  'precipitation',
  'visibility',
  'wind',
]);

// Lower values are better: good <= goodMax < caution <= cautionMax < poor.
function byMaximum(
  value: number | null,
  goodMax: number,
  cautionMax: number,
): FactorStatus {
  if (value === null) return 'unknown';
  if (value <= goodMax) return 'good';
  if (value <= cautionMax) return 'caution';
  return 'poor';
}

// Higher values are better: good >= goodMin > caution >= cautionMin > poor.
function byMinimum(
  value: number | null,
  goodMin: number,
  cautionMin: number,
): FactorStatus {
  if (value === null) return 'unknown';
  if (value >= goodMin) return 'good';
  if (value >= cautionMin) return 'caution';
  return 'poor';
}

const SEVERITY: Record<FactorStatus, number> = {
  good: 0,
  unknown: 1,
  caution: 1,
  poor: 2,
};

function precipitationStatus(weather: Omit<HourlyWeather, 'forecastAt'>): FactorStatus {
  const probability = byMaximum(weather.precipitationProbabilityPercent, 10, 30);
  // Any measurable rain (>= 0.1 mm) is at least caution; above 1 mm is poor.
  const amount =
    weather.precipitationMillimeters === null
      ? 'unknown'
      : weather.precipitationMillimeters < 0.1
        ? 'good'
        : weather.precipitationMillimeters <= 1
          ? 'caution'
          : 'poor';

  if (probability === 'unknown') return amount;
  if (amount === 'unknown') return probability;

  return SEVERITY[probability] >= SEVERITY[amount] ? probability : amount;
}

export function assessConditions(
  weather: Omit<HourlyWeather, 'forecastAt'>,
  sunAltitudeDegrees: number,
): ConditionsAssessment {
  const factors: ConditionFactor[] = [
    // Astronomical night below -18 degrees; twilight until -6 degrees.
    { code: 'darkness', status: byMaximum(sunAltitudeDegrees, -18, -6) },
    { code: 'cloud-cover', status: byMaximum(weather.cloudCoverPercent, 20, 60) },
    { code: 'precipitation', status: precipitationStatus(weather) },
    { code: 'visibility', status: byMinimum(weather.visibilityMeters, 10_000, 5_000) },
    { code: 'wind', status: byMaximum(weather.windSpeedKilometersPerHour, 15, 30) },
    { code: 'humidity', status: byMaximum(weather.relativeHumidityPercent, 80, 90) },
  ];

  const critical = factors.filter((factor) => CRITICAL_FACTORS.has(factor.code));

  const rating: ObservationRating = critical.some((f) => f.status === 'poor')
    ? 'poor'
    : factors.every((f) => f.status === 'good')
      ? 'good'
      : 'fair';

  return { rating, factors };
}
