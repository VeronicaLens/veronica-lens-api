import { describe, expect, it, vi } from 'vitest';

import {
  SupabaseEventsModel,
  type EventRow,
  type EventsClient,
} from '../../src/modules/events/events.model.js';

const row: EventRow = {
  id: '30000000-0000-4000-8000-000000000001',
  slug: 'chuva-de-meteoros-geminideas',
  title: 'Chuva de meteoros Geminídeas',
  description: 'Pico da chuva de meteoros.',
  event_type: 'meteor-shower',
  celestial_object_name: null,
  starts_at: '2026-12-13T21:00:00+00:00',
  ends_at: '2026-12-14T09:00:00+00:00',
  peaks_at: '2026-12-14T03:00:00+00:00',
};

function setup(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'lte', 'or', 'order', 'limit', 'maybeSingle']) {
    query[method] = vi.fn(() => query);
  }
  query.limit.mockResolvedValue(result);
  query.maybeSingle.mockResolvedValue(result);

  const client = { from: vi.fn(() => query) };
  const createClient = vi.fn((_token: string) => client as unknown as EventsClient);

  return { query, client, createClient, model: new SupabaseEventsModel(createClient) };
}

const filter = {
  from: new Date('2026-12-01T00:00:00Z'),
  to: new Date('2027-01-01T00:00:00Z'),
  limit: 50,
};

describe('SupabaseEventsModel.findMany', () => {
  it('queries only published manual events overlapping the window', async () => {
    const { query, client, createClient, model } = setup({ data: [row], error: null });

    await expect(model.findMany('test-access-token', filter)).resolves.toEqual({
      events: [row],
      error: null,
    });

    expect(createClient).toHaveBeenCalledExactlyOnceWith('test-access-token');
    expect(client.from).toHaveBeenCalledWith('astronomical_events');
    expect(query.eq.mock.calls).toEqual([
      ['provider', 'manual'],
      ['published', true],
    ]);
    expect(query.lte).toHaveBeenCalledWith('starts_at', '2027-01-01T00:00:00.000Z');
    expect(query.or).toHaveBeenCalledWith(
      'ends_at.gte."2026-12-01T00:00:00.000Z",and(ends_at.is.null,starts_at.gte."2026-12-01T00:00:00.000Z")',
    );
    expect(query.order.mock.calls).toEqual([
      ['starts_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(query.limit).toHaveBeenCalledWith(50);
  });

  it('filters by type when requested', async () => {
    const { query, model } = setup({ data: [], error: null });

    await model.findMany('t', { ...filter, type: 'meteor-shower' });

    expect(query.eq).toHaveBeenLastCalledWith('event_type', 'meteor-shower');
  });

  it('returns provider errors and an empty list', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const { model } = setup({ data: null, error });

    await expect(model.findMany('t', filter)).resolves.toEqual({ events: [], error });
  });
});

describe('SupabaseEventsModel.findById', () => {
  it('reads one published manual event', async () => {
    const { query, model } = setup({ data: row, error: null });

    await expect(model.findById('t', row.id)).resolves.toEqual({ event: row, error: null });
    expect(query.eq.mock.calls).toEqual([
      ['id', row.id],
      ['provider', 'manual'],
      ['published', true],
    ]);
  });
});
