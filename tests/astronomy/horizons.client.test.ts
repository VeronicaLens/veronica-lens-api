import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { AstronomyProviderError } from '../../src/modules/astronomy/astronomy.types.js';
import { HorizonsClient } from '../../src/modules/astronomy/horizons.client.js';

const moonPayload = readFileSync(
  new URL('../fixtures/horizons-moon-observer.json', import.meta.url),
  'utf8',
);

const request = {
  providerObjectId: '301',
  observedAt: new Date('2026-06-01T00:00:00Z'),
  observer: {
    latitudeDegrees: -22.9,
    longitudeDegrees: -47.06,
    elevationMeters: 600,
  },
};

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(responses: Array<Response | Error>) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      fetchMock.mockResolvedValueOnce(response);
    }
  }

  const sleep = vi.fn(async (_ms: number) => {});
  const client = new HorizonsClient({ fetch: fetchMock, sleep });

  return { fetchMock, sleep, client };
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: AstronomyProviderError['code'],
) {
  const error = await promise.catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(AstronomyProviderError);
  expect((error as AstronomyProviderError).code).toBe(code);
}

describe('HorizonsClient', () => {
  it('parses the real Horizons response for the Moon', async () => {
    const { client } = setup([jsonResponse(moonPayload)]);

    const position = await client.getApparentPosition(request);

    expect(position.observedAt).toBe('2026-06-01T00:00:00.000Z');
    // 17h 06m 33.73s and -27° 35' 34.9" from the fixture.
    expect(position.equatorial.rightAscensionDegrees).toBeCloseTo(256.640541, 5);
    expect(position.equatorial.declinationDegrees).toBeCloseTo(-27.593028, 5);
    expect(position.horizontal).toEqual({
      azimuthDegrees: 107.378169,
      altitudeDegrees: 41.12791,
    });
  });

  it('sends the observer, instant and quantities to Horizons', async () => {
    const { client, fetchMock } = setup([jsonResponse(moonPayload)]);

    await client.getApparentPosition(request);

    const [url, init] = fetchMock.mock.calls[0];
    const params = new URL(String(url)).searchParams;

    expect(String(url)).toMatch(/^https:\/\/ssd\.jpl\.nasa\.gov\/api\/horizons\.api\?/);
    expect(Object.fromEntries(params)).toMatchObject({
      format: 'json',
      COMMAND: "'301'",
      CENTER: "'coord@399'",
      COORD_TYPE: 'GEODETIC',
      SITE_COORD: "'-47.06,-22.9,0.6'",
      TLIST: "'2026-06-01 00:00:00.000'",
      QUANTITIES: "'2,4'",
      CSV_FORMAT: 'YES',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each(["301' OR '1", '', 'moon', '1234567890'])(
    'rejects provider id %j without calling Horizons',
    async (providerObjectId) => {
      const { client, fetchMock } = setup([]);

      await expectProviderError(
        client.getApparentPosition({ ...request, providerObjectId }),
        'REJECTED',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('reports an error field as a rejected request', async () => {
    const { client } = setup([
      jsonResponse(
        JSON.stringify({
          error: 'DXREAD: requested IOBJ= 99999999 is out of bounds',
          result: 'DXREAD: requested IOBJ= 99999999 is out of bounds',
        }),
      ),
    ]);

    await expectProviderError(client.getApparentPosition(request), 'REJECTED');
  });

  it('retries 503 responses with backoff and then succeeds', async () => {
    const { client, fetchMock, sleep } = setup([
      jsonResponse('busy', 503),
      jsonResponse('busy', 503),
      jsonResponse(moonPayload),
    ]);

    await expect(client.getApparentPosition(request)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[300], [600]]);
  });

  it('gives up after three attempts', async () => {
    const { client, fetchMock } = setup([
      jsonResponse('busy', 503),
      jsonResponse('busy', 503),
      jsonResponse('busy', 503),
    ]);

    await expectProviderError(client.getApparentPosition(request), 'UNAVAILABLE');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient statuses', async () => {
    const { client, fetchMock } = setup([jsonResponse('bad', 400)]);

    await expectProviderError(client.getApparentPosition(request), 'UNAVAILABLE');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports network failures and timeouts as unavailable', async () => {
    const { client } = setup([new DOMException('timed out', 'TimeoutError')]);

    await expectProviderError(client.getApparentPosition(request), 'UNAVAILABLE');
  });

  it.each([
    ['malformed JSON', 'not json'],
    ['missing result', '{}'],
    ['missing rows', JSON.stringify({ result: 'no ephemeris here' })],
    [
      'invalid coordinates',
      JSON.stringify({
        result: '$$SOE\n 2026-Jun-01 00:00, ,m, 17 06, -27 35 34.9, abc, 41.1,\n$$EOE',
      }),
    ],
    [
      'altitude out of range',
      JSON.stringify({
        result:
          '$$SOE\n 2026-Jun-01 00:00, ,m, 17 06 33.73, -27 35 34.9, 107.3, 95.0,\n$$EOE',
      }),
    ],
  ])('reports %s as an invalid response', async (_name, body) => {
    const { client } = setup([jsonResponse(body)]);

    await expectProviderError(
      client.getApparentPosition(request),
      'INVALID_RESPONSE',
    );
  });

  it('limits concurrent requests across callers', async () => {
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn<typeof fetch>(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return jsonResponse(moonPayload);
    });
    const client = new HorizonsClient({
      fetch: fetchMock,
      maxConcurrentRequests: 2,
    });

    await Promise.all(
      Array.from({ length: 6 }, () => client.getApparentPosition(request)),
    );

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });
});
