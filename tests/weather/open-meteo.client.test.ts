import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { OpenMeteoClient } from '../../src/modules/weather/open-meteo.client.js';
import { WeatherProviderError } from '../../src/modules/weather/weather.types.js';

const fixture = readFileSync(
  new URL('../fixtures/open-meteo-forecast.json', import.meta.url),
  'utf8',
);

const request = {
  latitudeDegrees: -22.9,
  longitudeDegrees: -47.06,
  from: new Date('2026-10-24T00:00:00Z'),
  to: new Date('2026-10-24T23:59:59Z'),
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

  return {
    fetchMock,
    sleep,
    client: new OpenMeteoClient({ fetch: fetchMock, sleep }),
  };
}

async function expectProviderError(
  promise: Promise<unknown>,
  code: WeatherProviderError['code'],
) {
  const error = await promise.catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(WeatherProviderError);
  expect((error as WeatherProviderError).code).toBe(code);
}

function payloadWith(changes: (payload: Record<string, any>) => void): string {
  const payload = JSON.parse(fixture);
  changes(payload);
  return JSON.stringify(payload);
}

describe('OpenMeteoClient', () => {
  it('maps the real Open-Meteo response', async () => {
    const { client } = setup([jsonResponse(fixture)]);

    const forecast = await client.getHourlyForecast(request);

    expect(forecast.gridLocation).toEqual({
      latitudeDegrees: -22.88225,
      longitudeDegrees: -47.01773,
      elevationMeters: 667,
    });
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.hourly[0]).toEqual({
      forecastAt: '2026-10-24T00:00:00.000Z',
      temperatureCelsius: 19,
      relativeHumidityPercent: 93,
      precipitationProbabilityPercent: 31,
      precipitationMillimeters: 0,
      cloudCoverPercent: 69,
      visibilityMeters: 16420,
      windSpeedKilometersPerHour: 5.1,
    });
    expect(forecast.hourly[23].forecastAt).toBe('2026-10-24T23:00:00.000Z');
  });

  it('requests the variables in UTC for the date range', async () => {
    const { client, fetchMock } = setup([jsonResponse(fixture)]);

    await client.getHourlyForecast(request);

    const [url, init] = fetchMock.mock.calls[0];
    const params = Object.fromEntries(new URL(String(url)).searchParams);

    expect(String(url)).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
    expect(params).toEqual({
      latitude: '-22.9',
      longitude: '-47.06',
      hourly:
        'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,visibility,wind_speed_10m',
      timezone: 'GMT',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      start_date: '2026-10-24',
      end_date: '2026-10-24',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns only the hours inside the requested window', async () => {
    const { client } = setup([jsonResponse(fixture)]);

    const forecast = await client.getHourlyForecast({
      ...request,
      from: new Date('2026-10-24T21:00:00Z'),
      to: new Date('2026-10-24T23:00:00Z'),
    });

    expect(forecast.hourly.map((hour) => hour.forecastAt)).toEqual([
      '2026-10-24T21:00:00.000Z',
      '2026-10-24T22:00:00.000Z',
      '2026-10-24T23:00:00.000Z',
    ]);
  });

  it('keeps null values instead of rejecting the forecast', async () => {
    const body = payloadWith((payload) => {
      payload.hourly.visibility[0] = null;
      payload.hourly.precipitation_probability[5] = null;
      delete payload.elevation;
    });
    const { client } = setup([jsonResponse(body)]);

    const forecast = await client.getHourlyForecast(request);

    expect(forecast.hourly[0].visibilityMeters).toBeNull();
    expect(forecast.hourly[0].cloudCoverPercent).toBe(69);
    expect(forecast.hourly[5].precipitationProbabilityPercent).toBeNull();
    expect(forecast.gridLocation.elevationMeters).toBeNull();
  });

  it('reports out-of-range dates (HTTP 400) as rejected without retrying', async () => {
    const { client, fetchMock } = setup([
      jsonResponse(
        JSON.stringify({
          error: true,
          reason: "Parameter 'start_date' is out of allowed range",
        }),
        400,
      ),
    ]);

    await expectProviderError(client.getHourlyForecast(request), 'REJECTED');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries transient failures and then succeeds', async () => {
    const { client, fetchMock, sleep } = setup([
      jsonResponse('busy', 503),
      jsonResponse('limit', 429),
      jsonResponse(fixture),
    ]);

    await expect(client.getHourlyForecast(request)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[300], [600]]);
  });

  it('gives up after three transient failures', async () => {
    const { client } = setup([
      jsonResponse('busy', 503),
      jsonResponse('busy', 503),
      jsonResponse('busy', 503),
    ]);

    await expectProviderError(client.getHourlyForecast(request), 'UNAVAILABLE');
  });

  it('reports network failures as unavailable', async () => {
    const { client } = setup([new TypeError('fetch failed')]);

    await expectProviderError(client.getHourlyForecast(request), 'UNAVAILABLE');
  });

  it.each([
    ['malformed JSON', 'not json'],
    ['missing hourly', JSON.stringify({ latitude: 1, longitude: 2 })],
    ['missing coordinates', payloadWith((p) => delete p.latitude)],
    ['missing column', payloadWith((p) => delete p.hourly.cloud_cover)],
    ['misaligned column', payloadWith((p) => p.hourly.cloud_cover.pop())],
    ['text value', payloadWith((p) => (p.hourly.cloud_cover[0] = '69'))],
    ['time with offset', payloadWith((p) => (p.hourly.time[0] = '2026-10-24T00:00Z'))],
  ])('reports %s as an invalid response', async (_name, body) => {
    const { client } = setup([jsonResponse(body)]);

    await expectProviderError(
      client.getHourlyForecast(request),
      'INVALID_RESPONSE',
    );
  });

  it.each([
    { ...request, latitudeDegrees: 91 },
    { ...request, longitudeDegrees: Number.NaN },
    { ...request, from: new Date('invalid') },
    { ...request, from: request.to, to: request.from },
  ])('rejects invalid request %# without calling Open-Meteo', async (input) => {
    const { client, fetchMock } = setup([]);

    await expectProviderError(client.getHourlyForecast(input), 'REJECTED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
