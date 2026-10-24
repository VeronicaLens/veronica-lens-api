import {
  AuthApiError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import {
  SupabaseAuthModel,
  type AuthModelPort,
} from '../../src/modules/auth/auth.model.js';

function setup() {
  const model = {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
    refresh: vi.fn<AuthModelPort['refresh']>(),
    getUser: vi.fn<AuthModelPort['getUser']>(),
    signOut: vi.fn<AuthModelPort['signOut']>(),
  };

  return {
    model,
    app: createApp({ authModel: model }),
  };
}

function createSession(): Session {
  return {
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
    access_token: 'new-access-token',
    refresh_token: 'new-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1893456000,
  };
}

describe('Session refresh', () => {
  it('delegates refresh to the Supabase SDK', async () => {
    const session = createSession();

    const client = {
      signUp: vi.fn<SupabaseClient['auth']['signUp']>(),
      signInWithPassword:
        vi.fn<SupabaseClient['auth']['signInWithPassword']>(),
      refreshSession:
        vi.fn<SupabaseClient['auth']['refreshSession']>(),
      getUser: vi.fn<SupabaseClient['auth']['getUser']>(),
      admin: {
        signOut:
          vi.fn<SupabaseClient['auth']['admin']['signOut']>(),
      },
    };

    client.refreshSession.mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    });

    const model = new SupabaseAuthModel(() => client);

    const result = await model.refresh({
      refreshToken: 'old-refresh-token',
    });

    expect(client.refreshSession).toHaveBeenCalledExactlyOnceWith({
      refresh_token: 'old-refresh-token',
    });
    expect(result.session).toBe(session);
    expect(result.error).toBeNull();
  });

  it('returns the new public session', async () => {
    const { app, model } = setup();
    const session = createSession();

    model.refresh.mockResolvedValue({
      user: session.user,
      session,
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'old-refresh-token' })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        user: {
          id: session.user.id,
          email: 'user@example.com',
          displayName: null,
        },
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'bearer',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });

    expect(model.refresh).toHaveBeenCalledExactlyOnceWith({
      refreshToken: 'old-refresh-token',
    });
  });

  it.each([
    {},
    { refreshToken: '' },
    { refreshToken: '   ' },
    { refreshToken: 123 },
  ])('rejects invalid input %j', async (body) => {
    const { app, model } = setup();

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(model.refresh).not.toHaveBeenCalled();
  });

  it.each([
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_not_found',
    'session_expired',
  ])('returns 401 for %s', async (code) => {
    const { app, model } = setup();

    model.refresh.mockResolvedValue({
      user: null,
      session: null,
      error: new AuthApiError('Internal provider details', 400, code),
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' })
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_SESSION_INVALID',
        message: 'Authentication session is invalid or expired',
      },
    });
  });

  it('rejects provider success without a session', async () => {
    const { app, model } = setup();

    model.refresh.mockResolvedValue({
      user: null,
      session: null,
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'old-refresh-token' })
      .expect(502);

    expect(response.body.error.code).toBe('AUTH_RESPONSE_INVALID');
  });

  it('returns 503 when the provider is unavailable', async () => {
    const { app, model } = setup();

    model.refresh.mockResolvedValue({
      user: null,
      session: null,
      error: new AuthApiError('Internal provider details', 503, undefined),
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'old-refresh-token' })
      .expect(503);

    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
  });
});