import type {
  ApparentPosition,
  EphemerisProviderPort,
  EphemerisRequest,
} from './astronomy.types.js';

export interface CachedEphemerisOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<ApparentPosition>;
}

const MINUTE_MS = 60_000;

// Requests are rounded to the minute and to ~100 m so nearby users share
// entries. In one minute the sky turns 0.25 degrees.
function roundRequest(request: EphemerisRequest): EphemerisRequest {
  const minute =
    Math.round(request.observedAt.getTime() / MINUTE_MS) * MINUTE_MS;
  const round = (value: number, decimals: number) =>
    Number(value.toFixed(decimals));

  return {
    providerObjectId: request.providerObjectId,
    observedAt: new Date(minute),
    observer: {
      latitudeDegrees: round(request.observer.latitudeDegrees, 3),
      longitudeDegrees: round(request.observer.longitudeDegrees, 3),
      elevationMeters: Math.round(request.observer.elevationMeters / 100) * 100,
    },
  };
}

function keyOf(request: EphemerisRequest): string {
  const { latitudeDegrees, longitudeDegrees, elevationMeters } =
    request.observer;

  return [
    request.providerObjectId,
    request.observedAt.toISOString(),
    latitudeDegrees,
    longitudeDegrees,
    elevationMeters,
  ].join('|');
}

// In-memory and per process. Concurrent identical requests share one call;
// failures are not cached.
export class CachedEphemerisProvider implements EphemerisProviderPort {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: EphemerisProviderPort,
    options: CachedEphemerisOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 10 * MINUTE_MS;
    this.maxEntries = options.maxEntries ?? 1_000;
    this.now = options.now ?? Date.now;
  }

  getApparentPosition(request: EphemerisRequest): Promise<ApparentPosition> {
    const rounded = roundRequest(request);
    const key = keyOf(rounded);
    const now = this.now();
    const cached = this.entries.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    this.entries.delete(key);

    const value = this.inner.getApparentPosition(rounded);
    value.catch(() => {
      if (this.entries.get(key)?.value === value) {
        this.entries.delete(key);
      }
    });

    if (this.entries.size >= this.maxEntries) {
      // Map preserves insertion order: drop the oldest entry.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }

    this.entries.set(key, { expiresAt: now + this.ttlMs, value });

    return value;
  }

  get size(): number {
    return this.entries.size;
  }
}
