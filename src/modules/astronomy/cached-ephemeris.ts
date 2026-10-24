import type {
  ApparentPosition,
  EphemerisProviderPort,
  EphemerisRequest,
  ObserverLocation,
  RiseTransitSetEvent,
  RiseTransitSetRequest,
} from './astronomy.types.js';

export interface CachedEphemerisOptions {
  ttlMs?: number;
  riseSetTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// ~100 m: nearby users share entries.
function roundObserver(observer: ObserverLocation): ObserverLocation {
  return {
    latitudeDegrees: Number(observer.latitudeDegrees.toFixed(3)),
    longitudeDegrees: Number(observer.longitudeDegrees.toFixed(3)),
    elevationMeters: Math.round(observer.elevationMeters / 100) * 100,
  };
}

function observerKey(observer: ObserverLocation): string {
  return `${observer.latitudeDegrees}|${observer.longitudeDegrees}|${observer.elevationMeters}`;
}

// In-memory and per process. Concurrent identical requests share one call;
// failures are not cached.
export class CachedEphemerisProvider implements EphemerisProviderPort {
  private readonly positions = new Map<string, CacheEntry<ApparentPosition>>();
  private readonly riseSet = new Map<string, CacheEntry<RiseTransitSetEvent[]>>();
  private readonly ttlMs: number;
  private readonly riseSetTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: EphemerisProviderPort,
    options: CachedEphemerisOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 10 * MINUTE_MS;
    this.riseSetTtlMs = options.riseSetTtlMs ?? 6 * HOUR_MS;
    this.maxEntries = options.maxEntries ?? 1_000;
    this.now = options.now ?? Date.now;
  }

  // Rounded to the minute: in one minute the sky turns 0.25 degrees.
  getApparentPosition(request: EphemerisRequest): Promise<ApparentPosition> {
    const rounded: EphemerisRequest = {
      providerObjectId: request.providerObjectId,
      observedAt: new Date(
        Math.round(request.observedAt.getTime() / MINUTE_MS) * MINUTE_MS,
      ),
      observer: roundObserver(request.observer),
    };
    const key = [
      rounded.providerObjectId,
      rounded.observedAt.toISOString(),
      observerKey(rounded.observer),
    ].join('|');

    return this.memo(this.positions, key, this.ttlMs, () =>
      this.inner.getApparentPosition(rounded),
    );
  }

  // Widened to whole hours so nearby windows share one call; each caller
  // receives only the events inside its own range.
  async getRiseTransitSet(
    request: RiseTransitSetRequest,
  ): Promise<RiseTransitSetEvent[]> {
    const widened: RiseTransitSetRequest = {
      providerObjectId: request.providerObjectId,
      from: new Date(Math.floor(request.from.getTime() / HOUR_MS) * HOUR_MS),
      to: new Date(Math.ceil(request.to.getTime() / HOUR_MS) * HOUR_MS),
      observer: roundObserver(request.observer),
    };
    const key = [
      widened.providerObjectId,
      widened.from.toISOString(),
      widened.to.toISOString(),
      observerKey(widened.observer),
    ].join('|');

    const events = await this.memo(this.riseSet, key, this.riseSetTtlMs, () =>
      this.inner.getRiseTransitSet(widened),
    );

    return events.filter((event) => {
      const at = Date.parse(event.at);

      return at >= request.from.getTime() && at <= request.to.getTime();
    });
  }

  get size(): number {
    return this.positions.size + this.riseSet.size;
  }

  private memo<T>(
    entries: Map<string, CacheEntry<T>>,
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const now = this.now();
    const cached = entries.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    entries.delete(key);

    const value = load();
    value.catch(() => {
      if (entries.get(key)?.value === value) {
        entries.delete(key);
      }
    });

    if (entries.size >= this.maxEntries) {
      // Map preserves insertion order: drop the oldest entry.
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) {
        entries.delete(oldest);
      }
    }

    entries.set(key, { expiresAt: now + ttlMs, value });

    return value;
  }
}
