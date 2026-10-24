import type { User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { createAppMocks } from '../helpers/mocks.js';

const endpoint = '/api/v1/catalog/celestial-objects';
const bearer = 'Bearer test-access-token';

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

  mocks.authModel.getUser.mockResolvedValue({
    user: createUser(),
    error: null,
  });

  return { app: createApp(mocks) };
}

describe('GET /api/v1/catalog/celestial-objects', () => {
  it('lists the first 20 objects by default', async () => {
    const response = await request(setup().app)
      .get(endpoint)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.objects).toHaveLength(20);
    expect(response.body.meta).toEqual({ count: 20 });
    expect(response.body.data.objects[0]).toEqual({
      id: 'moon',
      name: 'Lua',
      type: 'moon',
      aliases: ['Moon', 'Luna'],
      magnitude: null,
      coordinates: {
        kind: 'ephemeris',
        provider: 'jpl-horizons',
        providerObjectId: '301',
      },
    });
  });

  it('searches with a trimmed term, type and limit', async () => {
    const response = await request(setup().app)
      .get(endpoint)
      .query({ q: '  centauri ', type: 'star', limit: '1' })
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.objects.map((o: { id: string }) => o.id)).toEqual([
      'alpha-centauri',
    ]);
    expect(response.body.data.objects[0].coordinates).toEqual({
      kind: 'fixed',
      epoch: 'J2000',
      rightAscensionDegrees: 219.902083,
      declinationDegrees: -60.833972,
    });
  });

  it('returns an empty list when nothing matches', async () => {
    const response = await request(setup().app)
      .get(endpoint)
      .query({ q: 'andromeda' })
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body).toEqual({ data: { objects: [] }, meta: { count: 0 } });
  });

  it.each([
    'q=',
    'q=%20%20',
    `q=${'x'.repeat(81)}`,
    'type=galaxy',
    'limit=0',
    'limit=51',
    'limit=2.5',
    'limit=abc',
    'type=star&type=planet',
    'unknown=1',
  ])('rejects invalid query %s', async (query) => {
    const response = await request(setup().app)
      .get(`${endpoint}?${query}`)
      .set('Authorization', bearer)
      .expect(400);

    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Query parameters are invalid',
    });
  });

  it('requires authentication', async () => {
    const response = await request(setup().app).get(endpoint).expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
  });
});

describe('GET /api/v1/catalog/celestial-objects/:id', () => {
  it('returns one object', async () => {
    const response = await request(setup().app)
      .get(`${endpoint}/crux`)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.object).toMatchObject({
      id: 'crux',
      name: 'Cruzeiro do Sul',
      type: 'constellation',
    });
  });

  it.each(['pluto', 'CRUX', 'crux%20', '..%2F..%2Fetc', 'a'.repeat(65)])(
    'returns 404 for %s',
    async (id) => {
      const response = await request(setup().app)
        .get(`${endpoint}/${id}`)
        .set('Authorization', bearer)
        .expect(404);

      expect(response.body.error.code).toBe('CELESTIAL_OBJECT_NOT_FOUND');
    },
  );

  it('requires authentication', async () => {
    await request(setup().app).get(`${endpoint}/crux`).expect(401);
  });
});
