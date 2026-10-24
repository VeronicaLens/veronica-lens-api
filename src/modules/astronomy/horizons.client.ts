import { Semaphore } from '../../shared/http/semaphore.js';
import {
  AstronomyProviderError,
  type ApparentPosition,
  type EphemerisProviderPort,
  type EphemerisRequest,
} from './astronomy.types.js';

export interface HorizonsClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxConcurrentRequests?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

// JPL Horizons answers bursts from one client with 503; retry those briefly.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const PROVIDER_OBJECT_ID = /^\d{1,9}$/;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HorizonsClient implements EphemerisProviderPort {
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly semaphore: Semaphore;

  constructor(options: HorizonsClientOptions = {}) {
    this.fetch = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://ssd.jpl.nasa.gov/api';
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 300;
    this.sleep = options.sleep ?? defaultSleep;
    this.semaphore = new Semaphore(options.maxConcurrentRequests ?? 3);
  }

  async getApparentPosition(
    request: EphemerisRequest,
  ): Promise<ApparentPosition> {
    // The id is interpolated into the Horizons COMMAND parameter.
    if (!PROVIDER_OBJECT_ID.test(request.providerObjectId)) {
      throw new AstronomyProviderError(
        'REJECTED',
        'Provider object id must be numeric',
      );
    }

    if (Number.isNaN(request.observedAt.getTime())) {
      throw new AstronomyProviderError('REJECTED', 'Observation date is invalid');
    }

    const { latitudeDegrees, longitudeDegrees, elevationMeters } =
      request.observer;
    const url = new URL(`${this.baseUrl}/horizons.api`);

    url.search = new URLSearchParams({
      format: 'json',
      COMMAND: `'${request.providerObjectId}'`,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: "'coord@399'",
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `'${longitudeDegrees},${latitudeDegrees},${elevationMeters / 1_000}'`,
      TLIST: `'${formatInstant(request.observedAt)}'`,
      QUANTITIES: "'2,4'",
      CSV_FORMAT: 'YES',
    }).toString();

    const payload = await this.semaphore.run(() => this.fetchJson(url));

    return parseObserverEphemeris(payload, request.observedAt);
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
        throw new AstronomyProviderError(
          'UNAVAILABLE',
          'JPL Horizons is unreachable',
          { cause: error },
        );
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch (error) {
          throw new AstronomyProviderError(
            'INVALID_RESPONSE',
            'JPL Horizons returned malformed JSON',
            { cause: error },
          );
        }
      }

      if (!RETRYABLE_STATUSES.has(response.status) || attempt >= this.maxAttempts) {
        throw new AstronomyProviderError(
          'UNAVAILABLE',
          `JPL Horizons responded with status ${response.status}`,
        );
      }

      await this.sleep(this.retryDelayMs * attempt);
    }
  }
}

function formatInstant(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

// Row columns for QUANTITIES 2,4 in CSV:
// date, solar presence, lunar presence, RA (h m s), DEC (d m s), azimuth, elevation
export function parseObserverEphemeris(
  payload: unknown,
  observedAt: Date,
): ApparentPosition {
  if (typeof payload !== 'object' || payload === null) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Payload is not an object');
  }

  const { error, result } = payload as { error?: unknown; result?: unknown };

  // Horizons reports request errors with HTTP 200 and an `error` field.
  if (typeof error === 'string' && error.length > 0) {
    throw new AstronomyProviderError('REJECTED', 'JPL Horizons rejected the request');
  }

  if (typeof result !== 'string') {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Payload has no result text');
  }

  const row = /\$\$SOE\s*\n([^\n]+)\n\s*\$\$EOE/
    .exec(result)?.[1]
    ?.split(',')
    .map((value) => value.trim());

  if (!row || row.length < 7) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Ephemeris row is missing');
  }

  const rightAscensionDegrees = parseSexagesimal(row[3], 15);
  const declinationDegrees = parseSexagesimal(row[4], 1);
  const azimuthDegrees = Number(row[5]);
  const altitudeDegrees = Number(row[6]);

  if (
    rightAscensionDegrees === null ||
    declinationDegrees === null ||
    row[5] === '' ||
    row[6] === '' ||
    !Number.isFinite(azimuthDegrees) ||
    !Number.isFinite(altitudeDegrees) ||
    rightAscensionDegrees < 0 ||
    rightAscensionDegrees >= 360 ||
    Math.abs(declinationDegrees) > 90 ||
    azimuthDegrees < 0 ||
    azimuthDegrees > 360 ||
    Math.abs(altitudeDegrees) > 90
  ) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Coordinates are invalid');
  }

  return {
    observedAt: observedAt.toISOString(),
    equatorial: { rightAscensionDegrees, declinationDegrees },
    horizontal: { altitudeDegrees, azimuthDegrees },
  };
}

// "17 06 33.73" (hours) or "-27 35 34.9" (degrees); the sign applies to all parts.
function parseSexagesimal(value: string | undefined, scale: number): number | null {
  const match = /^([+-]?)(\d+) (\d+) (\d+(?:\.\d+)?)$/.exec(value?.trim() ?? '');

  if (!match) {
    return null;
  }

  const [, sign, whole, minutes, seconds] = match;
  const magnitude =
    Number(whole) + Number(minutes) / 60 + Number(seconds) / 3_600;

  return (sign === '-' ? -1 : 1) * magnitude * scale;
}
