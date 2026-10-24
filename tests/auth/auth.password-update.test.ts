import {
  AuthApiError,
  type Session,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import {
  SupabaseAuthModel,
  type AuthModelPort,
} from '../../src/modules/auth/auth.model.js';

const userId = '00000000-0000-4000-8000-000000000001';
const endpoint = '/api/v1/auth/password';
const validBody = {
  password: 'new-test-password',
  refreshToken: 'test-refresh-token',
};

function createUser(id = userId): User {
  return {
    id,
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function createSession(
  overrides: Partial<Session> = {},
): Session {
  return {
    user: createUser(),
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

function setupHttp() {
  const model = {
    signUp: vi.fn<AuthModelPort['signUp']>(),
    signIn: vi.fn<AuthModelPort['signIn']>(),
    refresh: vi.fn<AuthModelPort['refresh']>(),
    getUser: vi.fn<AuthModelPort['getUser']>(),
    signOut: vi.fn<AuthModelPort['signOut']>(),
    requestPasswordRecovery:
      vi.fn<AuthModelPort['requestPasswordRecovery']>(),
    updatePassword: vi.fn<AuthModelPort['updatePassword']>(),
  };

  model.getUser.mockResolvedValue({
    user: createUser(),
    error: null,
  });

  return {
    model,
    app: createApp({ authModel: model }),
  };
}

function setupSdk() {
  const client = {
    signUp: vi.fn<SupabaseClient['auth']['signUp']>(),
    signInWithPassword:
      vi.fn<SupabaseClient['auth']['signInWithPassword']>(),
    refreshSession: vi.fn<SupabaseClient['auth']['refreshSession']>(),
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

  const createClient = vi.fn(() => client);
  const model = new SupabaseAuthModel(
    createClient,
    'veronicalens://auth/reset-password',
  );

  return { client, createClient, model };
}

const modelInput = {
  userId,
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  password: 'new-test-password',
};

function mockSession(
  client: ReturnType<typeof setupSdk>['client'],
  session: Session,
) {
  client.setSession.mockResolvedValue({
    data: { user: session.user, session },
    error: null,
  });
}

describe('SupabaseAuthModel.updatePassword', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates the password within a single per-request client', async () => {
    const { client, createClient, model } = setupSdk();
    const user = createUser();

    mockSession(client, createSession());
    client.updateUser.mockResolvedValue({
      data: { user },
      error: null,
    });

    await expect(model.updatePassword(modelInput)).resolves.toEqual({
      status: 'updated',
      user,
    });

    expect(createClient).toHaveBeenCalledOnce();
    expect(client.setSession).toHaveBeenCalledExactlyOnceWith({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
    });
    expect(client.updateUser).toHaveBeenCalledExactlyOnceWith({
      password: 'new-test-password',
    });
  });

  it('does not update when the session cannot be established', async () => {
    const { client, model } = setupSdk();
    const error = new AuthApiError('Invalid JWT', 401, 'bad_jwt');

    client.setSession.mockResolvedValue({
      data: { user: null, session: null },
      error,
    });

    await expect(model.updatePassword(modelInput)).resolves.toEqual({
      status: 'failed',
      error,
    });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('refuses sessions close to expiry to avoid token rotation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));

    const { client, model } = setupSdk();
    const nowSeconds = Math.floor(Date.now() / 1000);

    mockSession(client, createSession({ expires_at: nowSeconds + 60 }));

    await expect(model.updatePassword(modelInput)).resolves.toEqual({
      status: 'session-unusable',
    });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('refuses a session belonging to a different user', async () => {
    const { client, model } = setupSdk();

    mockSession(
      client,
      createSession({
        user: createUser('00000000-0000-4000-8000-000000000002'),
      }),
    );

    await expect(model.updatePassword(modelInput)).resolves.toEqual({
      status: 'session-unusable',
    });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('refuses a session renewed by the SDK', async () => {
    const { client, model } = setupSdk();

    mockSession(
      client,
      createSession({ access_token: 'rotated-access-token' }),
    );

    await expect(model.updatePassword(modelInput)).resolves.toEqual({
      status: 'session-unusable',
    });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it('returns provider errors from the update', async () => {
    const { client, model } = setupSdk();
    const error = new AuthApiError(
      'Same password',
      422,
      'same_password',
    );

    mockSession(client, createSession());
    client.updateUser.mockResolvedValue({
      data: { user: null },
      error,
    });

    await expect(model.updatePassword(modelInput)).resolves.toEqual({
      status: 'failed',
      error,
    });
  });
});

describe('PUT /api/v1/auth/password', () => {
  it('updates the password and returns only the public user', async () => {
    const { app, model } = setupHttp();

    model.updatePassword.mockResolvedValue({
      status: 'updated',
      user: createUser(),
    });

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', 'Bearer test-access-token')
      .send(validBody)
      .expect(200);

    expect(response.body).toEqual({
      data: {
        user: {
          id: userId,
          email: 'user@example.com',
          displayName: null,
        },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(
      'new-test-password',
    );
    expect(model.updatePassword).toHaveBeenCalledExactlyOnceWith({
      userId,
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      password: 'new-test-password',
    });
  });

  it('requires authentication before validating the body', async () => {
    const { app, model } = setupHttp();

    const response = await request(app)
      .put(endpoint)
      .send(validBody)
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_REQUIRED');
    expect(model.getUser).not.toHaveBeenCalled();
    expect(model.updatePassword).not.toHaveBeenCalled();
  });

  it.each([
    { password: 'short', refreshToken: 'test-refresh-token' },
    { password: 'x'.repeat(73), refreshToken: 'test-refresh-token' },
    { password: 'new-test-password' },
    { password: 'new-test-password', refreshToken: '   ' },
  ])('rejects invalid input %#', async (body) => {
    const { app, model } = setupHttp();

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', 'Bearer test-access-token')
      .send(body)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(model.updatePassword).not.toHaveBeenCalled();
  });

  it('asks the app to refresh an unusable session', async () => {
    const { app, model } = setupHttp();

    model.updatePassword.mockResolvedValue({
      status: 'session-unusable',
    });

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', 'Bearer test-access-token')
      .send(validBody)
      .expect(401);

    expect(response.body.error.code).toBe(
      'AUTH_SESSION_REFRESH_REQUIRED',
    );
  });

  it.each([
    ['same_password', 422, 400, 'AUTH_PASSWORD_REJECTED'],
    ['weak_password', 422, 400, 'AUTH_PASSWORD_REJECTED'],
    [
      'reauthentication_needed',
      400,
      403,
      'AUTH_REAUTHENTICATION_REQUIRED',
    ],
    ['bad_jwt', 401, 401, 'AUTH_TOKEN_INVALID'],
    ['refresh_token_not_found', 400, 401, 'AUTH_SESSION_INVALID'],
    [undefined, 429, 429, 'AUTH_RATE_LIMITED'],
    [undefined, 503, 503, 'AUTH_UNAVAILABLE'],
  ] as const)(
    'maps provider error %s (%i) to %i %s',
    async (code, providerStatus, status, errorCode) => {
      const { app, model } = setupHttp();

      model.updatePassword.mockResolvedValue({
        status: 'failed',
        error: new AuthApiError(
          'Internal provider details',
          providerStatus,
          code,
        ),
      });

      const response = await request(app)
        .put(endpoint)
        .set('Authorization', 'Bearer test-access-token')
        .send(validBody)
        .expect(status);

      expect(response.body.error.code).toBe(errorCode);
      expect(JSON.stringify(response.body)).not.toContain(
        'Internal provider details',
      );
    },
  );

  it('rejects a provider response for another user', async () => {
    const { app, model } = setupHttp();

    model.updatePassword.mockResolvedValue({
      status: 'updated',
      user: createUser('00000000-0000-4000-8000-000000000002'),
    });

    const response = await request(app)
      .put(endpoint)
      .set('Authorization', 'Bearer test-access-token')
      .send(validBody)
      .expect(502);

    expect(response.body.error.code).toBe('AUTH_RESPONSE_INVALID');
  });
});
