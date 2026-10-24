import {
  AuthApiError,
  type Session,
  type User,
} from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { SupabaseAuthModel } from '../../src/modules/auth/auth.model.js';
import {
  createAppMocks,
  createAuthClientMock,
  createAuthModelMock,
} from '../helpers/mocks.js';

const endpoint = '/api/v1/auth/google';
const idToken = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';

function createUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'user@gmail.com',
    aud: 'authenticated',
    app_metadata: { provider: 'google' },
    user_metadata: metadata,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function createSession(user = createUser()): Session {
  return {
    user,
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 1893456000,
  };
}

function setupHttp() {
  const model = createAuthModelMock();

  return {
    model,
    app: createApp({ ...createAppMocks(), authModel: model }),
  };
}

function setupSdk() {
  const client = createAuthClientMock();
  const model = new SupabaseAuthModel(
    () => client,
    'veronicalens://auth/reset-password',
  );

  return { client, model };
}

describe('SupabaseAuthModel.signInWithGoogle', () => {
  it('exchanges the Google ID token and nonce with Supabase', async () => {
    const { client, model } = setupSdk();
    const session = createSession();

    client.signInWithIdToken.mockResolvedValue({
      data: { user: session.user, session },
      error: null,
    });

    await expect(
      model.signInWithGoogle({ idToken, nonce: 'raw-nonce' }),
    ).resolves.toEqual({ user: session.user, session, error: null });

    expect(client.signInWithIdToken).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      token: idToken,
      nonce: 'raw-nonce',
    });
  });

  it('omits the nonce when the app does not send one', async () => {
    const { client, model } = setupSdk();

    client.signInWithIdToken.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Bad ID token', 400, 'bad_jwt'),
    });

    await model.signInWithGoogle({ idToken });

    expect(client.signInWithIdToken).toHaveBeenCalledExactlyOnceWith({
      provider: 'google',
      token: idToken,
    });
  });
});

describe('POST /api/v1/auth/google', () => {
  it('returns a public session with the Google display name', async () => {
    const { app, model } = setupHttp();

    model.signInWithGoogle.mockResolvedValue({
      user: null,
      session: createSession(
        createUser({ full_name: ' Veronica Lens ', avatar_url: 'x' }),
      ),
      error: null,
    });

    const response = await request(app)
      .post(endpoint)
      .send({ idToken, nonce: 'raw-nonce', ignored: true })
      .expect(200);

    expect(response.body).toEqual({
      data: {
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'user@gmail.com',
          displayName: 'Veronica Lens',
        },
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'bearer',
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
    });
    expect(model.signInWithGoogle).toHaveBeenCalledExactlyOnceWith({
      idToken,
      nonce: 'raw-nonce',
    });
  });

  it.each([
    ['missing token', {}],
    ['empty token', { idToken: '' }],
    ['not a JWT', { idToken: 'not-a-jwt' }],
    ['token with spaces', { idToken: 'a.b .c' }],
    ['token too long', { idToken: `a.${'b'.repeat(8192)}.c` }],
    ['empty nonce', { idToken, nonce: '' }],
    ['long nonce', { idToken, nonce: 'n'.repeat(257) }],
  ])('rejects %s before calling Supabase', async (_name, body) => {
    const { app, model } = setupHttp();

    const response = await request(app)
      .post(endpoint)
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(model.signInWithGoogle).not.toHaveBeenCalled();
  });

  it.each([
    ['bad_jwt', 400, 401, 'AUTH_GOOGLE_TOKEN_INVALID'],
    ['validation_failed', 400, 401, 'AUTH_GOOGLE_TOKEN_INVALID'],
    [undefined, 400, 401, 'AUTH_GOOGLE_TOKEN_INVALID'],
    ['provider_disabled', 400, 503, 'AUTH_UNAVAILABLE'],
    ['email_not_confirmed', 400, 403, 'AUTH_EMAIL_NOT_CONFIRMED'],
    [undefined, 429, 429, 'AUTH_RATE_LIMITED'],
    [undefined, 503, 503, 'AUTH_UNAVAILABLE'],
  ] as const)(
    'maps provider error %s (%i) to %i %s',
    async (code, providerStatus, status, errorCode) => {
      const { app, model } = setupHttp();

      model.signInWithGoogle.mockResolvedValue({
        user: null,
        session: null,
        error: new AuthApiError(
          'Internal provider details',
          providerStatus,
          code,
        ),
      });

      const response = await request(app)
        .post(endpoint)
        .send({ idToken })
        .expect(status);

      expect(response.body.error.code).toBe(errorCode);
      expect(JSON.stringify(response.body)).not.toContain(
        'Internal provider details',
      );
    },
  );

  it('rejects a provider response without a session', async () => {
    const { app, model } = setupHttp();

    model.signInWithGoogle.mockResolvedValue({
      user: createUser(),
      session: null,
      error: null,
    });

    const response = await request(app)
      .post(endpoint)
      .send({ idToken })
      .expect(502);

    expect(response.body.error.code).toBe('AUTH_RESPONSE_INVALID');
  });

  it('shares the authentication attempt limit', async () => {
    const { app, model } = setupHttp();

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await request(app).post('/api/v1/auth/sign-in').send({}).expect(400);
    }

    await request(app).post(endpoint).send({ idToken }).expect(429);
    expect(model.signInWithGoogle).not.toHaveBeenCalled();
  });
});

describe('Public user display name', () => {
  it.each([
    [{ display_name: 'Email Name', full_name: 'Google Name' }, 'Email Name'],
    [{ full_name: 'Google Name', name: 'Short' }, 'Google Name'],
    [{ name: 'Short' }, 'Short'],
    [{ display_name: '  ', name: 'Fallback' }, 'Fallback'],
    [{ full_name: 42 }, null],
    [{ name: 'x'.repeat(150) }, 'x'.repeat(100)],
  ])('maps %j to %j', async (metadata, expected) => {
    const { app, model } = setupHttp();

    model.signInWithGoogle.mockResolvedValue({
      user: null,
      session: createSession(createUser(metadata)),
      error: null,
    });

    const response = await request(app)
      .post(endpoint)
      .send({ idToken })
      .expect(200);

    expect(response.body.data.user.displayName).toBe(expected);
  });
});
