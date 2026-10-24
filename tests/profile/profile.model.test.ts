import { describe, expect, it, vi } from 'vitest';

import {
  SupabaseProfileModel,
  type ProfileClient,
  type ProfileRow,
} from '../../src/modules/profile/profile.model.js';

const userId = '00000000-0000-4000-8000-000000000001';

function createRow(): ProfileRow {
  return {
    id: userId,
    display_name: 'Veronica',
    avatar_url: null,
    location_name: null,
    latitude: null,
    longitude: null,
    notifications_enabled: true,
    measurement_unit: 'metric',
    language: 'pt-BR',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function setup(result: { data: ProfileRow | null; error: unknown }) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };

  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  const client = { from: vi.fn(() => query) };
  const createClient = vi.fn(
    (_accessToken: string) => client as unknown as ProfileClient,
  );

  return {
    query,
    client,
    createClient,
    model: new SupabaseProfileModel(createClient),
  };
}

describe('SupabaseProfileModel', () => {
  it('reads the profile with the user token', async () => {
    const row = createRow();
    const { query, client, createClient, model } = setup({
      data: row,
      error: null,
    });

    await expect(
      model.findById('test-access-token', userId),
    ).resolves.toEqual({ profile: row, error: null });

    expect(createClient).toHaveBeenCalledExactlyOnceWith(
      'test-access-token',
    );
    expect(client.from).toHaveBeenCalledExactlyOnceWith('profiles');
    expect(query.select).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('notifications_enabled'),
    );
    expect(query.eq).toHaveBeenCalledExactlyOnceWith('id', userId);
    expect(query.maybeSingle).toHaveBeenCalledOnce();
    expect(query.update).not.toHaveBeenCalled();
  });

  it('updates only the given columns and returns the row', async () => {
    const row = createRow();
    const { query, model } = setup({ data: row, error: null });

    await expect(
      model.update('test-access-token', userId, {
        display_name: 'Ana',
        latitude: null,
        longitude: null,
      }),
    ).resolves.toEqual({ profile: row, error: null });

    expect(query.update).toHaveBeenCalledExactlyOnceWith({
      display_name: 'Ana',
      latitude: null,
      longitude: null,
    });
    expect(query.eq).toHaveBeenCalledExactlyOnceWith('id', userId);
    expect(query.select).toHaveBeenCalledOnce();
  });

  it('returns provider errors without throwing', async () => {
    const error = { code: '42501', message: 'permission denied' };
    const { model } = setup({ data: null, error });

    await expect(
      model.findById('test-access-token', userId),
    ).resolves.toEqual({ profile: null, error });
  });
});
