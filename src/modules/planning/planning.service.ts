import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import {
  AstronomyProviderError,
  equatorialToHorizontal,
  sunHorizontal,
  type EphemerisProviderPort,
  type EquatorialCoordinates,
  type ObserverLocation,
} from '../astronomy/index.js';
import type { CatalogModelPort } from '../catalog/catalog.model.js';
import type { CelestialObject } from '../catalog/catalog.types.js';
import { assessConditions } from '../conditions/conditions.assessment.js';
import {
  WeatherProviderError,
  type HourlyWeather,
  type WeatherProviderPort,
} from '../weather/index.js';
import type { RecommendationInput } from './planning.schemas.js';
import type {
  PlanningSample,
  RecommendationResult,
  RecommendedWindow,
} from './planning.types.js';

const SAMPLE_INTERVAL_MS = 15 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const MAX_PAST_MS = HOUR_MS;
const MAX_FUTURE_MS = 366 * 24 * HOUR_MS;

// Returns the equatorial position of the object at any instant of the window.
type PositionAt = (at: Date) => EquatorialCoordinates;

function sampleInstants(from: Date, to: Date): Date[] {
  const instants: Date[] = [];

  for (let t = from.getTime(); t < to.getTime(); t += SAMPLE_INTERVAL_MS) {
    instants.push(new Date(t));
  }

  instants.push(new Date(to));

  return instants;
}

// Linear interpolation; RA takes the short way around 0/360 degrees.
function interpolate(
  start: EquatorialCoordinates,
  end: EquatorialCoordinates,
  fraction: number,
): EquatorialCoordinates {
  const raDelta =
    ((end.rightAscensionDegrees - start.rightAscensionDegrees + 540) % 360) - 180;

  return {
    rightAscensionDegrees:
      (start.rightAscensionDegrees + raDelta * fraction + 360) % 360,
    declinationDegrees:
      start.declinationDegrees +
      (end.declinationDegrees - start.declinationDegrees) * fraction,
  };
}

// Longest run of consecutive favorable samples; the earliest wins ties.
function bestWindow(samples: PlanningSample[]): RecommendedWindow | null {
  let best: PlanningSample[] = [];
  let current: PlanningSample[] = [];

  for (const sample of samples) {
    current = sample.favorable ? [...current, sample] : [];

    if (current.length > best.length) {
      best = current;
    }
  }

  if (best.length === 0) {
    return null;
  }

  const peak = best.reduce((highest, sample) =>
    sample.altitudeDegrees > highest.altitudeDegrees ? sample : highest,
  );

  return {
    from: best[0].at,
    to: best[best.length - 1].at,
    peakAt: peak.at,
    peakAltitudeDegrees: peak.altitudeDegrees,
  };
}

export class PlanningService {
  constructor(
    private readonly catalog: CatalogModelPort,
    private readonly ephemeris: EphemerisProviderPort,
    private readonly weather: WeatherProviderPort,
    private readonly now: () => number = Date.now,
  ) {}

  async recommend(input: RecommendationInput): Promise<RecommendationResult> {
    const from = new Date(input.windowFrom);
    const to = new Date(input.windowTo);
    const now = this.now();

    if (from.getTime() < now - MAX_PAST_MS || to.getTime() > now + MAX_FUTURE_MS) {
      throw new AppError(
        400,
        'OBSERVATION_TIME_OUT_OF_RANGE',
        'The window must start at most one hour ago and end within one year',
      );
    }

    const object = await this.catalog.findById(input.objectId);

    if (!object) {
      throw new AppError(
        404,
        'CELESTIAL_OBJECT_NOT_FOUND',
        'Celestial object was not found',
      );
    }

    const [positionAt, weatherHours] = await Promise.all([
      this.positionFunction(object, from, to, input.observer),
      this.loadWeather(input.observer, from, to),
    ]);

    const weatherByHour = new Map(
      (weatherHours ?? []).map((hour) => [hour.forecastAt, hour]),
    );

    let belowMinimumAltitude = 0;
    let poorConditions = 0;

    const samples = sampleInstants(from, to).map((at): PlanningSample => {
      const altitudeDegrees = equatorialToHorizontal(
        positionAt(at),
        at,
        input.observer,
      ).altitudeDegrees;
      const sunAltitudeDegrees = sunHorizontal(at, input.observer).altitudeDegrees;
      const hourKey = new Date(Math.round(at.getTime() / HOUR_MS) * HOUR_MS).toISOString();
      const hour = weatherByHour.get(hourKey);

      // Without weather, only darkness is assessed.
      const rating = hour
        ? assessConditions(withoutTime(hour), sunAltitudeDegrees).rating
        : null;
      const tooBright = sunAltitudeDegrees > -6;
      const highEnough = altitudeDegrees >= input.minimumAltitudeDegrees;
      const conditionsOk = rating === null ? !tooBright : rating !== 'poor';

      if (!highEnough) belowMinimumAltitude += 1;
      if (!conditionsOk) poorConditions += 1;

      return {
        at: at.toISOString(),
        altitudeDegrees,
        sunAltitudeDegrees,
        rating,
        favorable: highEnough && conditionsOk,
      };
    });

    const window = bestWindow(samples);

    return {
      objectId: object.id,
      objectName: object.name,
      status: window ? 'recommended' : 'no_favorable_window',
      window,
      weatherAvailable: weatherHours !== null,
      minimumAltitudeDegrees: input.minimumAltitudeDegrees,
      sampleIntervalMinutes: SAMPLE_INTERVAL_MS / 60_000,
      rejections: { belowMinimumAltitude, poorConditions },
      samples,
    };
  }

  // Moving bodies: two Horizons calls (window edges) and interpolation; the
  // Moon's topocentric parallax makes this accurate to about one degree.
  private async positionFunction(
    object: CelestialObject,
    from: Date,
    to: Date,
    observer: ObserverLocation,
  ): Promise<PositionAt> {
    const { coordinates } = object;

    if (coordinates.kind === 'fixed') {
      return () => coordinates;
    }

    try {
      const [start, end] = await Promise.all(
        [from, to].map((observedAt) =>
          this.ephemeris.getApparentPosition({
            providerObjectId: coordinates.providerObjectId,
            observedAt,
            observer,
          }),
        ),
      );
      const duration = to.getTime() - from.getTime();

      return (at) =>
        interpolate(
          start.equatorial,
          end.equatorial,
          (at.getTime() - from.getTime()) / duration,
        );
    } catch (error) {
      if (!(error instanceof AstronomyProviderError)) {
        throw error;
      }

      logger.warn(
        { objectId: object.id, providerCode: error.code },
        'Ephemeris provider failed during planning',
      );

      throw new AppError(
        503,
        'PLANNING_UNAVAILABLE',
        'Object positions are temporarily unavailable',
      );
    }
  }

  private async loadWeather(
    observer: ObserverLocation,
    from: Date,
    to: Date,
  ): Promise<HourlyWeather[] | null> {
    try {
      const forecast = await this.weather.getHourlyForecast({
        latitudeDegrees: observer.latitudeDegrees,
        longitudeDegrees: observer.longitudeDegrees,
        // Cover the hour each edge sample rounds to.
        from: new Date(Math.floor(from.getTime() / HOUR_MS) * HOUR_MS),
        to: new Date(Math.ceil(to.getTime() / HOUR_MS) * HOUR_MS),
      });

      return forecast.hourly;
    } catch (error) {
      if (!(error instanceof WeatherProviderError)) {
        throw error;
      }

      // Windows beyond the forecast range are rejected; plan without weather.
      logger.warn({ providerCode: error.code }, 'Weather unavailable during planning');

      return null;
    }
  }
}

function withoutTime(hour: HourlyWeather): Omit<HourlyWeather, 'forecastAt'> {
  const { forecastAt: _forecastAt, ...weather } = hour;

  return weather;
}
