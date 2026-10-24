import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { AstronomyProviderError } from '../../src/modules/astronomy/astronomy.types.js';
import {
  HorizonsClient,
  parseRiseTransitSet,
} from '../../src/modules/astronomy/horizons.client.js';

const fixture = readFileSync(
  new URL('../fixtures/horizons-moon-rise-set.json', import.meta.url),
  'utf8',
);

const request = {
  providerObjectId: '301',
  from: new Date('2026-06-01T00:00:00Z'),
  to: new Date('2026-06-02T01:00:00Z'),
  observer: { latitudeDegrees: -22.9, longitudeDegrees: -47.06, elevationMeters: 600 },
};

describe('HorizonsClient.getRiseTransitSet', () => {
  it('parses the real Horizons rise/transit/set table for the Moon', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(fixture, { status: 200 }),
    );
    const client = new HorizonsClient({ fetch: fetchMock });

    await expect(client.getRiseTransitSet(request)).resolves.toEqual([
      { type: 'transit', at: '2026-06-01T03:42:00.000Z', azimuthDegrees: 181.546596, altitudeDegrees: 85.018766 },
      { type: 'set', at: '2026-06-01T10:52:00.000Z', azimuthDegrees: 239.019504, altitudeDegrees: -1.687514 },
      { type: 'rise', at: '2026-06-01T21:23:00.000Z', azimuthDegrees: 120.911259, altitudeDegrees: -1.513834 },
    ]);

    const params = Object.fromEntries(new URL(String(fetchMock.mock.calls[0][0])).searchParams);

    expect(params).toMatchObject({
      COMMAND: "'301'",
      START_TIME: "'2026-06-01 00:00'",
      STOP_TIME: "'2026-06-02 01:00'",
      STEP_SIZE: "'1 m'",
      QUANTITIES: "'4'",
      R_T_S_ONLY: 'YES',
      SITE_COORD: "'-47.06,-22.9,0.6'",
    });
  });

  it('accepts an empty table when nothing happens in the range', () => {
    expect(parseRiseTransitSet({ result: 'header\n$$SOE\n$$EOE\nfooter' })).toEqual([]);
  });

  it('ignores rows without a rise, transit or set marker', () => {
    expect(
      parseRiseTransitSet({
        result: '$$SOE\n 2026-Jun-01 03:42, ,t, 181.5, 85.0,\n 2026-Jun-01 05:00,C, , 200.0, 60.0,\n$$EOE',
      }),
    ).toHaveLength(1);
  });

  it.each([
    ['error field', { error: 'bad', result: 'bad' }, 'REJECTED'],
    ['missing table', { result: 'no table' }, 'INVALID_RESPONSE'],
    ['invalid date', { result: '$$SOE\n 2026-06-01 03:42, ,t, 1, 2,\n$$EOE' }, 'INVALID_RESPONSE'],
    ['invalid month', { result: '$$SOE\n 2026-Foo-01 03:42, ,t, 1, 2,\n$$EOE' }, 'INVALID_RESPONSE'],
    ['missing azimuth', { result: '$$SOE\n 2026-Jun-01 03:42, ,t, , 2,\n$$EOE' }, 'INVALID_RESPONSE'],
  ])('rejects %s', (_name, payload, code) => {
    let caught: unknown;

    try {
      parseRiseTransitSet(payload);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AstronomyProviderError);
    expect((caught as AstronomyProviderError).code).toBe(code);
  });

  it.each([
    ['inverted range', { ...request, from: request.to, to: request.from }],
    ['invalid id', { ...request, providerObjectId: "301' OR '1" }],
  ])('rejects %s without calling Horizons', async (_name, input) => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = new HorizonsClient({ fetch: fetchMock });

    await expect(client.getRiseTransitSet(input)).rejects.toMatchObject({ code: 'REJECTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
