import { describe, expect, it, vi } from 'vitest';

import {
  SupabaseAccountModel,
  type AdminClient,
} from '../../src/modules/account/account.model.js';

const userId = '00000000-0000-4000-8000-000000000001';

function rows(count: number, start = 0) {
  return Array.from({ length: count }, (_value, index) => ({
    storage_path: `${userId}/media-${start + index}.jpg`,
  }));
}

function setup() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  const bucket = { list: vi.fn(), remove: vi.fn() };
  const admin = { deleteUser: vi.fn() };
  const client = {
    from: vi.fn(() => query),
    storage: { from: vi.fn(() => bucket) },
    auth: { admin },
  };

  return {
    query,
    bucket,
    admin,
    client,
    model: new SupabaseAccountModel(
      () => client as unknown as AdminClient,
    ),
  };
}

describe('SupabaseAccountModel', () => {
  it('pages through the observation media of the user', async () => {
    const { client, query, model } = setup();

    query.range
      .mockResolvedValueOnce({ data: rows(100), error: null })
      .mockResolvedValueOnce({ data: rows(3, 100), error: null });

    const result = await model.listObservationMediaPaths(userId);

    expect(result.error).toBeNull();
    expect(result.paths).toHaveLength(103);
    expect(result.paths[102]).toBe(`${userId}/media-102.jpg`);
    expect(client.from).toHaveBeenCalledWith('observation_media');
    expect(query.eq).toHaveBeenCalledWith('user_id', userId);
    expect(query.range.mock.calls).toEqual([
      [0, 99],
      [100, 199],
    ]);
  });

  it('reports database errors without the provider message', async () => {
    const { query, model } = setup();

    query.range.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Internal details' },
    });

    await expect(
      model.listObservationMediaPaths(userId),
    ).resolves.toEqual({
      paths: [],
      error: { source: 'database', code: '42501' },
    });
  });

  it('lists avatar files inside the user folder only', async () => {
    const { bucket, client, model } = setup();

    bucket.list.mockResolvedValue({
      data: [{ name: 'avatar' }, { name: 'avatar.png' }],
      error: null,
    });

    await expect(model.listAvatarPaths(userId)).resolves.toEqual({
      paths: [`${userId}/avatar`, `${userId}/avatar.png`],
      error: null,
    });
    expect(client.storage.from).toHaveBeenCalledWith('avatars');
    expect(bucket.list).toHaveBeenCalledExactlyOnceWith(userId, {
      limit: 100,
      offset: 0,
    });
  });

  it('removes files in batches of 100', async () => {
    const { bucket, client, model } = setup();
    const paths = rows(250).map((row) => row.storage_path);

    bucket.remove.mockResolvedValue({ data: [], error: null });

    await expect(
      model.removeFiles('observations', paths),
    ).resolves.toEqual({ error: null });

    expect(client.storage.from).toHaveBeenCalledWith('observations');
    expect(bucket.remove.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 100, 50,
    ]);
  });

  it('does not call Storage when there is nothing to remove', async () => {
    const { bucket, model } = setup();

    await expect(model.removeFiles('avatars', [])).resolves.toEqual({
      error: null,
    });
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('stops at the first Storage error', async () => {
    const { bucket, model } = setup();

    bucket.remove.mockResolvedValue({
      data: null,
      error: { status: 500, message: 'Internal details' },
    });

    await expect(
      model.removeFiles('observations', rows(150).map((row) => row.storage_path)),
    ).resolves.toEqual({ error: { source: 'storage', status: 500 } });
    expect(bucket.remove).toHaveBeenCalledOnce();
  });

  it('deletes the user and treats a missing user as already deleted', async () => {
    const { admin, model } = setup();

    admin.deleteUser
      .mockResolvedValueOnce({ data: { user: null }, error: null })
      .mockResolvedValueOnce({
        data: { user: null },
        error: { code: 'user_not_found', status: 404 },
      });

    await expect(model.deleteUser(userId)).resolves.toEqual({ error: null });
    await expect(model.deleteUser(userId)).resolves.toEqual({ error: null });
    expect(admin.deleteUser).toHaveBeenCalledWith(userId);
  });

  it('reports other Auth errors without the provider message', async () => {
    const { admin, model } = setup();

    admin.deleteUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'unexpected_failure', status: 500, message: 'Internal' },
    });

    await expect(model.deleteUser(userId)).resolves.toEqual({
      error: { source: 'auth', code: 'unexpected_failure', status: 500 },
    });
  });
});
