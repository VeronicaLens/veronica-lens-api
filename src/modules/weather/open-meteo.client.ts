import { Semaphore } from '../../shared/http/semaphore.js';
import {
  WeatherProviderError,
  type HourlyWeather,
  type WeatherForecast,
  type WeatherForecastRequest,
  type WeatherProviderPort,
} from './weather.types.js';

export interface OpenMeteoClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxConcurrentRequests?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// Open-Meteo variable name -> public field name.
const VARIABLES = {
  temperature_2m: 'temperatureCelsius',
  relative_humidity_2m: 'relativeHumidityPercent',
  precipitation_probability: 'precipitationProbabilityPercent',
  precipitation: 'precipitationMillimeters',
  cloud_cover: 'cloudCoverPercent',
  visibility: 'visibilityMeters',
  wind_speed_10m: 'windSpeedKilometersPerHour',
} as const satisfies Record<string, keyof Omit<HourlyWeather, 'forecastAt'>>;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class OpenMeteoClient implements WeatherProviderPort {
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly semaphore: Semaphore;

  constructor(options: OpenMeteoClientOptions = {}) {
    this.fetch = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.open-meteo.com/v1/forecast';
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 300;
    this.sleep = options.sleep ?? defaultSleep;
    this.semaphore = new Semaphore(options.maxConcurrentRequests ?? 4);
  }

  async getHourlyForecast(
    request: WeatherForecastRequest,
  ): Promise<WeatherForecast> {
    assertValidRequest(request);

    const url = new URL(this.baseUrl);
    url.search = new URLSearchParams({
      latitude: String(request.latitudeDegrees),
      longitude: String(request.longitudeDegrees),
      hourly: Object.keys(VARIABLES).join(','),
      timezone: 'GMT',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      start_date: request.from.toISOString().slice(0, 10),
      end_date: request.to.toISOString().slice(0, 10),
    }).toString();

    const payload = await this.semaphore.run(() => this.fetchJson(url));
    const forecast = parseForecast(payload);

    return {
      ...forecast,
      hourly: forecast.hourly.filter((hour) => {
        const instant = Date.parse(hour.forecastAt);

        return (
          instant >= request.from.getTime() && instant <= request.to.getTime()
        );
      }),
    };
  }

  private async fetchJson(url: URL): Promise<unknown> {
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;

      try {
        response = await this.fetch(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        throw new WeatherProviderError(
          'UNAVAILABLE',
          'Open-Meteo is unreachable',
          { cause: error },
        );
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch (error) {
          throw new WeatherProviderError(
            'INVALID_RESPONSE',
            'Open-Meteo returned malformed JSON',
            { cause: error },
          );
        }
      }

      // Open-Meteo answers invalid parameters, such as dates out of range, with 400.
      if (response.status === 400) {
        throw new WeatherProviderError('REJECTED', 'Open-Meteo rejected the request');
      }

      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= this.maxAttempts) {
        throw new WeatherProviderError(
          'UNAVAILABLE',
          `Open-Meteo responded with status ${response.status}`,
        );
      }

      await this.sleep(this.retryDelayMs * attempt);
    }
  }
}

function assertValidRequest(request: WeatherForecastRequest): void {
  const { latitudeDegrees, longitudeDegrees, from, to } = request;

  if (
    !Number.isFinite(latitudeDegrees) ||
    Math.abs(latitudeDegrees) > 90 ||
    !Number.isFinite(longitudeDegrees) ||
    Math.abs(longitudeDegrees) > 180 ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to
  ) {
    throw new WeatherProviderError('REJECTED', 'Weather request is invalid');
  }
}

function invalid(message: string): WeatherProviderError {
  return new WeatherProviderError('INVALID_RESPONSE', message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseForecast(payload: unknown): WeatherForecast {
  if (typeof payload !== 'object' || payload === null) {
    throw invalid('Payload is not an object');
  }

  const { latitude, longitude, elevation, hourly } = payload as Record<
    string,
    unknown
  >;

  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    throw invalid('Grid coordinates are invalid');
  }

  if (typeof hourly !== 'object' || hourly === null) {
    throw invalid('Hourly data is missing');
  }

  const columns = hourly as Record<string, unknown>;
  const times = columns.time;

  if (!Array.isArray(times)) {
    throw invalid('Hourly time column is missing');
  }

  for (const variable of Object.keys(VARIABLES)) {
    const column = columns[variable];

    if (!Array.isArray(column) || column.length !== times.length) {
      throw invalid(`Hourly column ${variable} is missing or misaligned`);
    }
  }

  return {
    gridLocation: {
      latitudeDegrees: latitude,
      longitudeDegrees: longitude,
      elevationMeters: isFiniteNumber(elevation) ? elevation : null,
    },
    hourly: times.map((time, index) => {
      // With timezone=GMT, times come as "YYYY-MM-DDTHH:MM" without offset.
      if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) {
        throw invalid('Hourly time is invalid');
      }

      const hour: HourlyWeather = {
        forecastAt: new Date(`${time}:00Z`).toISOString(),
        temperatureCelsius: null,
        relativeHumidityPercent: null,
        precipitationProbabilityPercent: null,
        precipitationMillimeters: null,
        cloudCoverPercent: null,
        visibilityMeters: null,
        windSpeedKilometersPerHour: null,
      };

      for (const [variable, field] of Object.entries(VARIABLES)) {
        const value = (columns[variable] as unknown[])[index];

        if (value !== null && !isFiniteNumber(value)) {
          throw invalid(`Hourly value for ${variable} is invalid`);
        }

        hour[field] = value;
      }

      return hour;
    }),
  };
}
