import {
  AuthApiError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { AuthModelPort } from '../../src/modules/auth/auth.model.js';

function createUser(): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: { display_name: 'Veronica' },
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function createSession(): Session {
  return {
    user: createUser(),
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1893456000,
  };
}

function setup() {
  const model = {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
    refresh: vi.fn<AuthModelPort['refresh']>(),
  };

  return {
    model,
    app: createApp({ authModel: model }),
  };
}

const credentials = {
  email: 'user@example.com',
  password: 'test-password',
};

describe('Authentication routes', () => {
  it('returns 202 when registration requires confirmation', async () => {
    const { app, model } = setup();

    model.signUp.mockResolvedValue({
      user: createUser(),
      session: null,
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-up')
      .send(credentials)
      .expect(202);

    expect(response.body).toEqual({
      data: {
        user: {
          id: createUser().id,
          email: credentials.email,
          displayName: 'Veronica',
        },
        session: null,
        confirmationRequired: true,
      },
    });

    expect(model.signUp).toHaveBeenCalledExactlyOnceWith(
      credentials,
    );
  });

  it('returns 201 when registration includes a session', async () => {
    const { app, model } = setup();

    model.signUp.mockResolvedValue({
      user: createUser(),
      session: createSession(),
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-up')
      .send(credentials)
      .expect(201);

    expect(response.body.data.confirmationRequired).toBe(false);
    expect(response.body.data.session.accessToken).toBe(
      'test-access-token',
    );
  });

  it('returns a public session on login', async () => {
    const { app, model } = setup();

    model.signIn.mockResolvedValue({
      user: createUser(),
      session: createSession(),
      error: null,
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-in')
      .send(credentials)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        user: {
          id: createUser().id,
          email: credentials.email,
          displayName: 'Veronica',
        },
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'bearer',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
  });

  it.each(['sign-up', 'sign-in'])(
    'rejects invalid input before calling the model: %s',
    async (endpoint) => {
      const { app, model } = setup();

      const response = await request(app)
        .post(`/api/v1/auth/${endpoint}`)
        .send({ email: 'invalid', password: '' })
        .expect(400);

      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body is invalid',
        },
      });

      expect(model.signUp).not.toHaveBeenCalled();
      expect(model.signIn).not.toHaveBeenCalled();
    },
  );

  it('returns a safe response for invalid credentials', async () => {
    const { app, model } = setup();

    model.signIn.mockResolvedValue({
      user: null,
      session: null,
      error: new AuthApiError(
        'Internal provider details',
        400,
        'invalid_credentials',
      ),
    });

    const response = await request(app)
      .post('/api/v1/auth/sign-in')
      .send(credentials)
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid authentication credentials',
      },
    });
  });

  it('handles asynchronous exceptions without exposing details', async () => {
    const { app, model } = setup();

    model.signIn.mockRejectedValue(
      new Error('Sensitive internal details'),
    );

    const response = await request(app)
      .post('/api/v1/auth/sign-in')
      .send(credentials)
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
      },
    });

    expect(response.headers['x-request-id']).toBeDefined();
  });
});