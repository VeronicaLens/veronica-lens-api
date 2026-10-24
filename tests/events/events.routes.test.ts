import type { PostgrestError, User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { EventRow } from '../../src/modules/events/events.model.js';
import { createAppMocks } from '../helpers/mocks.js';

const bearer = 'Bearer test-access-token';
const DAY_MS = 24 * 60 * 60 * 1_000;

const row: EventRow = {
  id: '30000000-0000-4000-8000-000000000001',
  slug: 'eclipse-lunar-total',
  title: 'Eclipse lunar total',
  description: 'Visível em todo o Brasil.',
  event_type: 'eclipse',
  celestial_object_name: 'Lua',
  starts_at: '2026-12-01T21:00:00+00:00',
  ends_at: null,
  peaks_at: '2026-12-01T22:30:00+00:00',
};

function createUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function setup() {
  const mocks = createAppMocks();

  mocks.authModel.getUser.mockResolvedValue({ user: createUser(), error: null });
  mocks.eventsModel.findMany.mockResolvedValue({ events: [row], error: null });
  mocks.eventsModel.findById.mockResolvedValue({ event: row, error: null });

  return { ...mocks, app: createApp(mocks) };
}

function postgrestError(code: string): PostgrestError {
  return { name: 'PostgrestError', code, message: 'Internal details', details: '', hint: '' } as PostgrestError;
}

describe('GET /api/v1/events', () => {
  it('lists events in public format for the next 90 days by default', async () => {
    const { app, eventsModel } = setup();
    const before = Date.now();

    const response = await request(app)
      .get('/api/v1/events')
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.events).toEqual([
      {
        id: row.id,
        slug: 'eclipse-lunar-total',
        title: 'Eclipse lunar total',
        description: 'Visível em todo o Brasil.',
        type: 'eclipse',
        celestialObjectName: 'Lua',
        startsAt: '2026-12-01T21:00:00.000Z',
        endsAt: null,
        peaksAt: '2026-12-01T22:30:00.000Z',
      },
    ]);
    expect(response.body.meta).toEqual({ count: 1 });

    const [token, filter] = eventsModel.findMany.mock.calls[0];
    expect(token).toBe('test-access-token');
    expect(filter.from.getTime()).toBeGreaterThanOrEqual(before);
    expect(filter.to.getTime() - filter.from.getTime()).toBe(90 * DAY_MS);
    expect(filter.limit).toBe(50);
    expect(filter).not.toHaveProperty('type');
  });

  it('passes explicit range, type and limit', async () => {
    const { app, eventsModel } = setup();

    const response = await request(app)
      .get('/api/v1/events')
      .query({
        from: '2026-12-01T00:00:00-03:00',
        to: '2027-01-01T00:00:00-03:00',
        type: 'meteor-shower',
        limit: '10',
      })
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.from).toBe('2026-12-01T03:00:00.000Z');
    expect(eventsModel.findMany.mock.calls[0][1]).toEqual({
      from: new Date('2026-12-01T03:00:00Z'),
      to: new Date('2027-01-01T03:00:00Z'),
      type: 'meteor-shower',
      limit: 10,
    });
  });

  it.each([
    ['ending before it starts', { from: '2026-12-02T00:00:00Z', to: '2026-12-01T00:00:00Z' }],
    ['longer than a year', { from: '2026-01-01T00:00:00Z', to: '2027-01-03T00:00:00Z' }],
  ])('rejects a range %s', async (_name, query) => {
    const { app, eventsModel } = setup();

    const response = await request(app)
      .get('/api/v1/events')
      .query(query)
      .set('Authorization', bearer)
      .expect(400);

    expect(response.body.error.code).toBe('EVENTS_RANGE_INVALID');
    expect(eventsModel.findMany).not.toHaveBeenCalled();
  });

  it.each([
    'from=yesterday',
    'to=2026-12-01T00:00:00',
    'type=Meteor%20Shower',
    'limit=0',
    'limit=101',
    'unknown=1',
  ])('rejects invalid query %s', async (query) => {
    const { app } = setup();

    const response = await request(app)
      .get(`/api/v1/events?${query}`)
      .set('Authorization', bearer)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['PGRST301', 401, 'AUTH_TOKEN_INVALID'],
    ['42501', 503, 'EVENTS_UNAVAILABLE'],
  ])('maps database error %s to %i', async (code, status, errorCode) => {
    const { app, eventsModel } = setup();

    eventsModel.findMany.mockResolvedValue({ events: [], error: postgrestError(code) });

    const response = await request(app)
      .get('/api/v1/events')
      .set('Authorization', bearer)
      .expect(status);

    expect(response.body.error.code).toBe(errorCode);
    expect(JSON.stringify(response.body)).not.toContain('Internal details');
  });

  it('requires authentication', async () => {
    const { app, eventsModel } = setup();

    await request(app).get('/api/v1/events').expect(401);
    expect(eventsModel.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/events/:id', () => {
  it('returns one event', async () => {
    const { app, eventsModel } = setup();

    const response = await request(app)
      .get(`/api/v1/events/${row.id}`)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.event.slug).toBe('eclipse-lunar-total');
    expect(eventsModel.findById).toHaveBeenCalledWith('test-access-token', row.id);
  });

  it('returns 404 when the event is missing or not visible', async () => {
    const { app, eventsModel } = setup();

    eventsModel.findById.mockResolvedValue({ event: null, error: null });

    const response = await request(app)
      .get(`/api/v1/events/${row.id}`)
      .set('Authorization', bearer)
      .expect(404);

    expect(response.body.error.code).toBe('EVENT_NOT_FOUND');
  });

  it('returns 404 for malformed ids without querying the database', async () => {
    const { app, eventsModel } = setup();

    await request(app)
      .get('/api/v1/events/not-a-uuid')
      .set('Authorization', bearer)
      .expect(404);

    expect(eventsModel.findById).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const { app } = setup();

    await request(app).get(`/api/v1/events/${row.id}`).expect(401);
  });
});
