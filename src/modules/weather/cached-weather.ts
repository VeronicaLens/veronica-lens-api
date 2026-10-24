import type {
  WeatherForecast,
  WeatherForecastRequest,
  WeatherProviderPort,
} from './weather.types.js';

export interface CachedWeatherOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<WeatherForecast>;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

function startOfUtcDay(date: Date): Date {
  return new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS);
}

// Fetches whole UTC days at ~1 km resolution so different windows and nearby
// users share one upstream request; each caller gets only its own hours.
export class CachedWeatherProvider implements WeatherProviderPort {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: WeatherProviderPort,
    options: CachedWeatherOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1_000;
    this.maxEntries = options.maxEntries ?? 500;
    this.now = options.now ?? Date.now;
  }

  async getHourlyForecast(
    request: WeatherForecastRequest,
  ): Promise<WeatherForecast> {
    const from = startOfUtcDay(request.from);
    const to = new Date(startOfUtcDay(request.to).getTime() + DAY_MS - 1);
    const widened: WeatherForecastRequest = {
      latitudeDegrees: Number(request.latitudeDegrees.toFixed(2)),
      longitudeDegrees: Number(request.longitudeDegrees.toFixed(2)),
      from,
      to,
    };

    const forecast = await this.load(widened);

    return {
      gridLocation: forecast.gridLocation,
      hourly: forecast.hourly.filter((hour) => {
        const instant = Date.parse(hour.forecastAt);

        return (
          instant >= request.from.getTime() && instant <= request.to.getTime()
        );
      }),
    };
  }

  get size(): number {
    return this.entries.size;
  }

  private load(request: WeatherForecastRequest): Promise<WeatherForecast> {
    const key = [
      request.latitudeDegrees,
      request.longitudeDegrees,
      request.from.toISOString(),
      request.to.toISOString(),
    ].join('|');
    const now = this.now();
    const cached = this.entries.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    this.entries.delete(key);

    const value = this.inner.getHourlyForecast(request);
    value.catch(() => {
      if (this.entries.get(key)?.value === value) {
        this.entries.delete(key);
      }
    });

    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, { expiresAt: now + this.ttlMs, value });

    return value;
  }
}
