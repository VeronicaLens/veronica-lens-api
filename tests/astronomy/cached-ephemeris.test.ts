import { describe, expect, it, vi } from 'vitest';

import type {
  ApparentPosition,
  EphemerisProviderPort,
  EphemerisRequest,
} from '../../src/modules/astronomy/astronomy.types.js';
import { CachedEphemerisProvider } from '../../src/modules/astronomy/cached-ephemeris.js';

function position(observedAt: Date): ApparentPosition {
  return {
    observedAt: observedAt.toISOString(),
    equatorial: { rightAscensionDegrees: 10, declinationDegrees: 20 },
    horizontal: { altitudeDegrees: 30, azimuthDegrees: 40 },
  };
}

function request(overrides: Partial<EphemerisRequest> = {}): EphemerisRequest {
  return {
    providerObjectId: '301',
    observedAt: new Date('2026-06-01T00:00:10Z'),
    observer: {
      latitudeDegrees: -22.90012,
      longitudeDegrees: -47.06044,
      elevationMeters: 640,
    },
    ...overrides,
  };
}

function setup(options: { maxEntries?: number } = {}) {
  let now = 0;
  const inner = {
    getApparentPosition: vi.fn<EphemerisProviderPort['getApparentPosition']>(
      async (req) => position(req.observedAt),
    ),
    getRiseTransitSet: vi.fn<EphemerisProviderPort['getRiseTransitSet']>(
      async () => [
        { type: 'rise', at: '2026-06-01T09:30:00.000Z', azimuthDegrees: 70, altitudeDegrees: -0.8 },
        { type: 'transit', at: '2026-06-01T15:00:00.000Z', azimuthDegrees: 0, altitudeDegrees: 60 },
        { type: 'set', at: '2026-06-01T21:10:00.000Z', azimuthDegrees: 290, altitudeDegrees: -0.8 },
      ],
    ),
  };
  const cache = new CachedEphemerisProvider(inner, {
    ttlMs: 1_000,
    riseSetTtlMs: 5_000,
    now: () => now,
    ...options,
  });

  return {
    inner,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('CachedEphemerisProvider', () => {
  it('rounds the request to the minute and ~100 m before calling the provider', async () => {
    const { inner, cache } = setup();

    await cache.getApparentPosition(request());

    expect(inner.getApparentPosition).toHaveBeenCalledExactlyOnceWith({
      providerObjectId: '301',
      observedAt: new Date('2026-06-01T00:00:00Z'),
      observer: {
        latitudeDegrees: -22.9,
        longitudeDegrees: -47.06,
        elevationMeters: 600,
      },
    });
  });

  it('reuses one result for nearby requests in the same minute', async () => {
    const { inner, cache } = setup();

    const first = await cache.getApparentPosition(request());
    const second = await cache.getApparentPosition(
      request({
        observedAt: new Date('2026-06-01T00:00:25Z'),
        observer: {
          latitudeDegrees: -22.90031,
          longitudeDegrees: -47.06021,
          elevationMeters: 580,
        },
      }),
    );

    expect(second).toBe(first);
    expect(inner.getApparentPosition).toHaveBeenCalledOnce();
  });

  it('shares one in-flight call between concurrent identical requests', async () => {
    const { inner, cache } = setup();

    await Promise.all([
      cache.getApparentPosition(request()),
      cache.getApparentPosition(request()),
      cache.getApparentPosition(request()),
    ]);

    expect(inner.getApparentPosition).toHaveBeenCalledOnce();
  });

  it('separates objects, minutes and distant locations', async () => {
    const { inner, cache } = setup();

    await cache.getApparentPosition(request());
    await cache.getApparentPosition(request({ providerObjectId: '499' }));
    await cache.getApparentPosition(
      request({ observedAt: new Date('2026-06-01T00:01:00Z') }),
    );
    await cache.getApparentPosition(
      request({
        observer: {
          latitudeDegrees: -23.5,
          longitudeDegrees: -46.6,
          elevationMeters: 760,
        },
      }),
    );

    expect(inner.getApparentPosition).toHaveBeenCalledTimes(4);
  });

  it('expires entries after the TTL', async () => {
    const { inner, cache, advance } = setup();

    await cache.getApparentPosition(request());
    advance(1_001);
    await cache.getApparentPosition(request());

    expect(inner.getApparentPosition).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const { inner, cache } = setup();
    const failure = new Error('provider down');

    inner.getApparentPosition.mockRejectedValueOnce(failure);

    await expect(cache.getApparentPosition(request())).rejects.toBe(failure);
    await expect(cache.getApparentPosition(request())).resolves.toBeDefined();
    expect(inner.getApparentPosition).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry when full', async () => {
    const { inner, cache } = setup({ maxEntries: 2 });

    await cache.getApparentPosition(request({ providerObjectId: '1' }));
    await cache.getApparentPosition(request({ providerObjectId: '2' }));
    await cache.getApparentPosition(request({ providerObjectId: '3' }));

    expect(cache.size).toBe(2);

    await cache.getApparentPosition(request({ providerObjectId: '1' }));
    expect(inner.getApparentPosition).toHaveBeenCalledTimes(4);
  });
});

describe('CachedEphemerisProvider.getRiseTransitSet', () => {
  const observer = {
    latitudeDegrees: -22.90012,
    longitudeDegrees: -47.06044,
    elevationMeters: 640,
  };

  it('widens the window to whole hours and returns only the requested events', async () => {
    const { inner, cache } = setup();

    const events = await cache.getRiseTransitSet({
      providerObjectId: '301',
      from: new Date('2026-06-01T09:45:00Z'),
      to: new Date('2026-06-01T20:30:00Z'),
      observer,
    });

    expect(inner.getRiseTransitSet).toHaveBeenCalledExactlyOnceWith({
      providerObjectId: '301',
      from: new Date('2026-06-01T09:00:00Z'),
      to: new Date('2026-06-01T21:00:00Z'),
      observer: { latitudeDegrees: -22.9, longitudeDegrees: -47.06, elevationMeters: 600 },
    });
    expect(events.map((event) => event.type)).toEqual(['transit']);
  });

  it('reuses one call for windows inside the same hours and expires it', async () => {
    const { inner, cache, advance } = setup();
    const base = { providerObjectId: '301', observer };

    await cache.getRiseTransitSet({ ...base, from: new Date('2026-06-01T09:05:00Z'), to: new Date('2026-06-01T20:05:00Z') });
    await cache.getRiseTransitSet({ ...base, from: new Date('2026-06-01T09:50:00Z'), to: new Date('2026-06-01T20:55:00Z') });
    expect(inner.getRiseTransitSet).toHaveBeenCalledOnce();

    advance(5_001);
    await cache.getRiseTransitSet({ ...base, from: new Date('2026-06-01T09:05:00Z'), to: new Date('2026-06-01T20:05:00Z') });
    expect(inner.getRiseTransitSet).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const { inner, cache } = setup();
    const request = { providerObjectId: '301', observer, from: new Date('2026-06-01T09:00:00Z'), to: new Date('2026-06-02T09:00:00Z') };

    inner.getRiseTransitSet.mockRejectedValueOnce(new Error('down'));

    await expect(cache.getRiseTransitSet(request)).rejects.toThrow('down');
    await expect(cache.getRiseTransitSet(request)).resolves.toHaveLength(3);
  });
});