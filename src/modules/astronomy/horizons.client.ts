import { Semaphore } from '../../shared/http/semaphore.js';
import {
  AstronomyProviderError,
  type ApparentPosition,
  type EphemerisProviderPort,
  type EphemerisRequest,
  type ObserverLocation,
  type RiseTransitSetEvent,
  type RiseTransitSetRequest,
  type RiseTransitSetType,
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
    assertValidDate(request.observedAt);

    const url = this.observerTableUrl(request.providerObjectId, request.observer, {
      TLIST: `'${formatInstant(request.observedAt)}'`,
      QUANTITIES: "'2,4'",
    });

    const payload = await this.semaphore.run(() => this.fetchJson(url));

    return parseObserverEphemeris(payload, request.observedAt);
  }

  // Horizons finds the events itself (R_T_S_ONLY) at one-minute resolution,
  // including refraction and the Moon's parallax.
  async getRiseTransitSet(
    request: RiseTransitSetRequest,
  ): Promise<RiseTransitSetEvent[]> {
    assertValidDate(request.from);
    assertValidDate(request.to);

    if (request.to <= request.from) {
      throw new AstronomyProviderError('REJECTED', 'Time range is invalid');
    }

    const url = this.observerTableUrl(request.providerObjectId, request.observer, {
      START_TIME: `'${formatMinute(request.from)}'`,
      STOP_TIME: `'${formatMinute(request.to)}'`,
      STEP_SIZE: "'1 m'",
      QUANTITIES: "'4'",
      R_T_S_ONLY: 'YES',
    });

    const payload = await this.semaphore.run(() => this.fetchJson(url));

    return parseRiseTransitSet(payload);
  }

  private observerTableUrl(
    providerObjectId: string,
    observer: ObserverLocation,
    extra: Record<string, string>,
  ): URL {
    // The id is interpolated into the Horizons COMMAND parameter.
    if (!PROVIDER_OBJECT_ID.test(providerObjectId)) {
      throw new AstronomyProviderError(
        'REJECTED',
        'Provider object id must be numeric',
      );
    }

    const { latitudeDegrees, longitudeDegrees, elevationMeters } = observer;
    const url = new URL(`${this.baseUrl}/horizons.api`);

    url.search = new URLSearchParams({
      format: 'json',
      COMMAND: `'${providerObjectId}'`,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'OBSERVER',
      CENTER: "'coord@399'",
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: `'${longitudeDegrees},${latitudeDegrees},${elevationMeters / 1_000}'`,
      ...extra,
      CSV_FORMAT: 'YES',
    }).toString();

    return url;
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

function formatMinute(value: Date): string {
  return formatInstant(value).slice(0, 16);
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) {
    throw new AstronomyProviderError('REJECTED', 'Date is invalid');
  }
}

// Validates the envelope and returns the text table produced by Horizons.
function resultText(payload: unknown): string {
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

  return result;
}

// Rows between $$SOE and $$EOE, split into trimmed CSV cells.
function tableRows(result: string): string[][] {
  const body = /\$\$SOE\s*\n([\s\S]*?)\n?\s*\$\$EOE/.exec(result)?.[1];

  if (body === undefined) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Ephemeris table is missing');
  }

  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EVENT_MARKERS: Record<string, RiseTransitSetType> = {
  r: 'rise',
  t: 'transit',
  s: 'set',
};

// "2026-Jun-01 03:42" in UTC.
function parseMinute(value: string): string {
  const match = /^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  const month = match ? MONTHS.indexOf(match[2]) : -1;

  if (!match || month < 0) {
    throw new AstronomyProviderError('INVALID_RESPONSE', 'Event time is invalid');
  }

  return new Date(
    Date.UTC(Number(match[1]), month, Number(match[3]), Number(match[4]), Number(match[5])),
  ).toISOString();
}

// Row columns with R_T_S_ONLY and QUANTITIES 4:
// date, solar presence, event marker (r/t/s), azimuth, elevation
export function parseRiseTransitSet(payload: unknown): RiseTransitSetEvent[] {
  // An empty table is valid: the object had no event in the range.
  return tableRows(resultText(payload)).flatMap((row) => {
    const type = EVENT_MARKERS[row[2] ?? ''];

    if (!type) {
      return [];
    }

    const azimuthDegrees = Number(row[3]);
    const altitudeDegrees = Number(row[4]);

    if (
      row[3] === '' ||
      row[4] === '' ||
      !Number.isFinite(azimuthDegrees) ||
      !Number.isFinite(altitudeDegrees)
    ) {
      throw new AstronomyProviderError('INVALID_RESPONSE', 'Event coordinates are invalid');
    }

    return [{ type, at: parseMinute(row[0] ?? ''), azimuthDegrees, altitudeDegrees }];
  });
}

// Row columns for QUANTITIES 2,4 in CSV:
// date, solar presence, lunar presence, RA (h m s), DEC (d m s), azimuth, elevation
export function parseObserverEphemeris(
  payload: unknown,
  observedAt: Date,
): ApparentPosition {
  const result = resultText(payload);

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
