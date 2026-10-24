import {
  AuthApiError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { SupabaseAuthModel } from '../../src/modules/auth/auth.model.js';
import { createAuthModelMock, createProfileModelMock } from '../helpers/mocks.js';

function createUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {
      display_name: 'Veronica',
      private_field: 'must-not-be-returned',
    },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function setup() {
  const model = createAuthModelMock();

  return {
    model,
    app: createApp({
      authModel: model,
      profileModel: createProfileModelMock(),
    }),
  };
}

describe('Authenticated user', () => {
  it('passes the token explicitly to the Supabase SDK', async () => {
    const user = createUser();

    const client = {
      signUp: vi.fn<SupabaseClient['auth']['signUp']>(),
      signInWithPassword:
        vi.fn<SupabaseClient['auth']['signInWithPassword']>(),
      refreshSession:
        vi.fn<SupabaseClient['auth']['refreshSession']>(),
      getUser: vi.fn<SupabaseClient['auth']['getUser']>(),
      resetPasswordForEmail:
        vi.fn<SupabaseClient['auth']['resetPasswordForEmail']>(),
      setSession: vi.fn<SupabaseClient['auth']['setSession']>(),
      updateUser: vi.fn<SupabaseClient['auth']['updateUser']>(),
      admin: {
        signOut:
          vi.fn<SupabaseClient['auth']['admin']['signOut']>(),
      },
    };

    client.getUser.mockResolvedValue({
      data: { user },
      error: null,
    });

    const model = new SupabaseAuthModel(
      () => client,
      'veronicalens://auth/reset-password',
    );
    const result = await model.getUser('test-access-token');

    expect(client.getUser).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
    );
    expect(result.user).toBe(user);
    expect(result.error).toBeNull();
  });

  it('rejects requests without credentials', async () => {
    const { app, model } = setup();

    const response = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(model.getUser).not.toHaveBeenCalled();
  });

  it.each(['Basic abc', 'Bearer', 'Bearer token extra'])(
    'rejects malformed authorization: %s',
    async (authorization) => {
      const { app, model } = setup();

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', authorization)
        .expect(401);

      expect(response.body.error.code).toBe('AUTH_TOKEN_INVALID');
      expect(model.getUser).not.toHaveBeenCalled();
    },
  );

  it('returns only the public user after token validation', async () => {
    const { app, model } = setup();

    model.getUser.mockResolvedValue({
      user: createUser(),
      error: null,
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'bearer test-access-token')
      .expect(200);

    expect(model.getUser).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
    );

    expect(response.body).toEqual({
      data: {
        user: {
          id: createUser().id,
          email: 'user@example.com',
          displayName: 'Veronica',
        },
      },
    });
  });

  it('returns 401 when Supabase rejects the token', async () => {
    const { app, model } = setup();

    model.getUser.mockResolvedValue({
      user: null,
      error: new AuthApiError(
        'Internal token verification details',
        401,
        'bad_jwt',
      ),
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Authentication token is invalid or expired',
      },
    });
  });

  it('does not classify provider unavailability as invalid credentials', async () => {
    const { app, model } = setup();

    model.getUser.mockResolvedValue({
      user: null,
      error: new AuthApiError('Internal provider details', 503, undefined),
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer test-access-token')
      .expect(503);

    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
  });

  it('rejects provider success without a user', async () => {
    const { app, model } = setup();

    model.getUser.mockResolvedValue({
      user: null,
      error: null,
    });

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer test-access-token')
      .expect(502);

    expect(response.body.error.code).toBe('AUTH_RESPONSE_INVALID');
  });
});