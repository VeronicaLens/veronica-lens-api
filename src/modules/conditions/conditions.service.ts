import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import { sunHorizontal, type ObserverLocation } from '../astronomy/index.js';
import {
  WeatherProviderError,
  type HourlyWeather,
  type WeatherProviderPort,
} from '../weather/index.js';
import {
  assessConditions,
  type ConditionFactor,
  type ObservationRating,
} from './conditions.assessment.js';
import type {
  ConditionsForecastInput,
  CurrentConditionsInput,
} from './conditions.schemas.js';

const HOUR_MS = 60 * 60 * 1_000;
export const FORECAST_HORIZON_MS = 7 * 24 * HOUR_MS;
// Tolerates client clock skew when asking for "now".
const PAST_TOLERANCE_MS = HOUR_MS;

export interface HourlyConditions {
  forecastAt: string;
  sunAltitudeDegrees: number;
  weather: Omit<HourlyWeather, 'forecastAt'>;
  rating: ObservationRating;
  factors: ConditionFactor[];
}

export interface CurrentConditionsResult {
  requestedAt: string;
  conditions: HourlyConditions;
}

export interface ConditionsForecastResult {
  from: string;
  to: string;
  hours: HourlyConditions[];
}

function unavailable(): AppError {
  return new AppError(
    503,
    'CONDITIONS_UNAVAILABLE',
    'Observation conditions are temporarily unavailable',
  );
}

function toConditions(
  hour: HourlyWeather,
  sunAltitudeDegrees: number,
): HourlyConditions {
  const { forecastAt, ...weather } = hour;
  const assessment = assessConditions(weather, sunAltitudeDegrees);

  return {
    forecastAt,
    sunAltitudeDegrees,
    weather,
    rating: assessment.rating,
    factors: assessment.factors,
  };
}

export class ConditionsService {
  constructor(
    private readonly weather: WeatherProviderPort,
    private readonly now: () => number = Date.now,
  ) {}

  async getCurrent(
    input: CurrentConditionsInput,
  ): Promise<CurrentConditionsResult> {
    const now = this.now();
    const requestedAt = input.at === undefined ? new Date(now) : new Date(input.at);
    const offset = requestedAt.getTime() - now;

    if (offset < -PAST_TOLERANCE_MS || offset > FORECAST_HORIZON_MS) {
      throw new AppError(
        400,
        'OBSERVATION_TIME_OUT_OF_RANGE',
        'Observation time must be within the next seven days',
      );
    }

    // Forecasts are hourly; use the closest hour.
    const hourAt = new Date(Math.round(requestedAt.getTime() / HOUR_MS) * HOUR_MS);
    const hours = await this.fetchHours(input.observer, hourAt, hourAt);
    const hour = hours.find((candidate) => candidate.forecastAt === hourAt.toISOString());

    if (!hour) {
      logger.warn('Weather forecast has no data for the requested hour');
      throw unavailable();
    }

    // The Sun uses the exact instant; weather uses the closest forecast hour.
    const sun = sunHorizontal(requestedAt, input.observer);

    return {
      requestedAt: requestedAt.toISOString(),
      conditions: toConditions(hour, sun.altitudeDegrees),
    };
  }

  async getForecast(
    input: ConditionsForecastInput,
  ): Promise<ConditionsForecastResult> {
    const now = this.now();
    // Always 168 hours, starting at the next full hour.
    const from = new Date((Math.floor(now / HOUR_MS) + 1) * HOUR_MS);
    const to = new Date(from.getTime() + FORECAST_HORIZON_MS - HOUR_MS);
    const hours = await this.fetchHours(input.observer, from, to);

    if (hours.length === 0) {
      logger.warn('Weather forecast returned no hours');
      throw unavailable();
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      hours: hours.map((hour) =>
        toConditions(
          hour,
          sunHorizontal(new Date(hour.forecastAt), input.observer).altitudeDegrees,
        ),
      ),
    };
  }

  private async fetchHours(
    observer: ObserverLocation,
    from: Date,
    to: Date,
  ): Promise<HourlyWeather[]> {
    try {
      const forecast = await this.weather.getHourlyForecast({
        latitudeDegrees: observer.latitudeDegrees,
        longitudeDegrees: observer.longitudeDegrees,
        from,
        to,
      });

      return forecast.hourly;
    } catch (error) {
      if (!(error instanceof WeatherProviderError)) {
        throw error;
      }

      logger.warn({ providerCode: error.code }, 'Weather provider failed');
      throw unavailable();
    }
  }
}
