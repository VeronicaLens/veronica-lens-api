import { describe, expect, it, vi } from 'vitest';

import {
  SupabaseAvatarStorage,
  type AvatarStorageClient,
  type StorageError,
} from '../../src/modules/profile/avatar.storage.js';

const userId = '00000000-0000-4000-8000-000000000001';

function setup() {
  const bucket = {
    upload: vi.fn(),
    remove: vi.fn(),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://cdn.example/avatars/${path}` },
    })),
  };
  const storage = { from: vi.fn(() => bucket) };
  const createClient = vi.fn(
    (_accessToken: string) => ({ storage }) as unknown as AvatarStorageClient,
  );

  return {
    bucket,
    storage,
    createClient,
    avatars: new SupabaseAvatarStorage(createClient),
  };
}

const storageError = {
  name: 'StorageApiError',
  message: 'Internal storage details',
  status: 500,
  statusCode: '500',
} as unknown as StorageError;

describe('SupabaseAvatarStorage', () => {
  it('uploads to a fixed path with the user token and returns the public URL', async () => {
    const { bucket, storage, createClient, avatars } = setup();
    const bytes = Buffer.from([0x89, 0x50]);

    bucket.upload.mockResolvedValue({ data: {}, error: null });

    await expect(
      avatars.upload('test-access-token', userId, {
        contentType: 'image/png',
        bytes,
      }),
    ).resolves.toEqual({
      publicUrl: `https://cdn.example/avatars/${userId}/avatar`,
      error: null,
    });

    expect(createClient).toHaveBeenCalledExactlyOnceWith('test-access-token');
    expect(storage.from).toHaveBeenCalledExactlyOnceWith('avatars');
    expect(bucket.upload).toHaveBeenCalledExactlyOnceWith(
      `${userId}/avatar`,
      bytes,
      { contentType: 'image/png', cacheControl: '3600', upsert: true },
    );
  });

  it('does not resolve a public URL when the upload fails', async () => {
    const { bucket, avatars } = setup();

    bucket.upload.mockResolvedValue({ data: null, error: storageError });

    await expect(
      avatars.upload('test-access-token', userId, {
        contentType: 'image/jpeg',
        bytes: Buffer.from([0xff]),
      }),
    ).resolves.toEqual({ publicUrl: null, error: storageError });
    expect(bucket.getPublicUrl).not.toHaveBeenCalled();
  });

  it('removes the current and legacy avatar files of the user only', async () => {
    const { bucket, avatars } = setup();

    bucket.remove.mockResolvedValue({ data: [], error: null });

    await expect(
      avatars.remove('test-access-token', userId),
    ).resolves.toEqual({ error: null });

    expect(bucket.remove).toHaveBeenCalledExactlyOnceWith([
      `${userId}/avatar`,
      `${userId}/avatar.jpg`,
      `${userId}/avatar.png`,
      `${userId}/avatar.webp`,
    ]);
  });
});
