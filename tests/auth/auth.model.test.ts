import {
  AuthApiError,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { SupabaseAuthModel } from '../../src/modules/auth/auth.model.js';

function setup() {
  const client = {
    signUp: vi.fn<SupabaseClient['auth']['signUp']>(),
    signInWithPassword:
      vi.fn<SupabaseClient['auth']['signInWithPassword']>(),
    refreshSession: vi.fn<SupabaseClient['auth']['refreshSession']>(),
    getUser: vi.fn<SupabaseClient['auth']['getUser']>(),
    admin: {
  signOut:
    vi.fn<SupabaseClient['auth']['admin']['signOut']>(),
},
  };

  const createClient = vi.fn(() => client);
  const model = new SupabaseAuthModel(createClient);

  return { client, createClient, model };
}

describe('SupabaseAuthModel', () => {
  it('sends registration data and display name to Supabase', async () => {
    const { client, model } = setup();
    const error = new AuthApiError(
      'Registration rejected',
      400,
      'weak_password',
    );

    client.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error,
    });

    const result = await model.signUp({
      email: 'user@example.com',
      password: 'test-password',
      displayName: 'Veronica',
    });

    expect(client.signUp).toHaveBeenCalledExactlyOnceWith({
      email: 'user@example.com',
      password: 'test-password',
      options: {
        data: {
          display_name: 'Veronica',
        },
      },
    });

    expect(result).toEqual({
      user: null,
      session: null,
      error,
    });
  });

  it('omits metadata when display name is absent', async () => {
    const { client, model } = setup();

    client.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    await model.signUp({
      email: 'user@example.com',
      password: 'test-password',
    });

    expect(client.signUp).toHaveBeenCalledExactlyOnceWith({
      email: 'user@example.com',
      password: 'test-password',
    });
  });

  it('forwards login credentials and provider errors', async () => {
    const { client, model } = setup();
    const error = new AuthApiError(
      'Invalid login credentials',
      400,
      'invalid_credentials',
    );

    client.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error,
    });

    const result = await model.signIn({
      email: 'user@example.com',
      password: 'wrong-password',
    });

    expect(
      client.signInWithPassword,
    ).toHaveBeenCalledExactlyOnceWith({
      email: 'user@example.com',
      password: 'wrong-password',
    });

    expect(result.error).toBe(error);
  });

  it('requests a client for every authentication operation', async () => {
    const { client, createClient, model } = setup();

    client.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const credentials = {
      email: 'user@example.com',
      password: 'test-password',
    };

    await model.signUp(credentials);
    await model.signUp(credentials);

    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('propagates unexpected exceptions', async () => {
    const { client, model } = setup();
    const failure = new Error('Unexpected SDK failure');

    client.signInWithPassword.mockRejectedValue(failure);

    await expect(
      model.signIn({
        email: 'user@example.com',
        password: 'test-password',
      }),
    ).rejects.toBe(failure);
  });
});