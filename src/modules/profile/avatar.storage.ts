import type { SupabaseClient } from '@supabase/supabase-js';

import type { AvatarFile } from './avatar-image.js';

type AvatarBucket = ReturnType<SupabaseClient['storage']['from']>;

export type StorageError = NonNullable<
  Awaited<ReturnType<AvatarBucket['upload']>>['error']
>;

export interface AvatarUploadResult {
  publicUrl: string | null;
  error: StorageError | null;
}

export interface AvatarRemoveResult {
  error: StorageError | null;
}

export interface AvatarStoragePort {
  upload(
    accessToken: string,
    userId: string,
    file: AvatarFile,
  ): Promise<AvatarUploadResult>;
  remove(accessToken: string, userId: string): Promise<AvatarRemoveResult>;
}

export type AvatarStorageClient = Pick<SupabaseClient, 'storage'>;

const BUCKET = 'avatars';

// Earlier versions stored the avatar with an extension in the file name.
const LEGACY_FILE_NAMES = ['avatar.jpg', 'avatar.png', 'avatar.webp'];

function avatarPath(userId: string): string {
  return `${userId}/avatar`;
}

// Runs with the user's JWT; Storage policies restrict writes to <user_id>/.
export class SupabaseAvatarStorage implements AvatarStoragePort {
  constructor(
    private readonly createClient: (
      accessToken: string,
    ) => AvatarStorageClient,
  ) {}

  async upload(
    accessToken: string,
    userId: string,
    file: AvatarFile,
  ): Promise<AvatarUploadResult> {
    const bucket = this.createClient(accessToken).storage.from(BUCKET);
    const path = avatarPath(userId);

    const { error } = await bucket.upload(path, file.bytes, {
      contentType: file.contentType,
      cacheControl: '3600',
      upsert: true,
    });

    if (error) {
      return { publicUrl: null, error };
    }

    return { publicUrl: bucket.getPublicUrl(path).data.publicUrl, error: null };
  }

  async remove(
    accessToken: string,
    userId: string,
  ): Promise<AvatarRemoveResult> {
    const { error } = await this.createClient(accessToken)
      .storage.from(BUCKET)
      .remove([
        avatarPath(userId),
        ...LEGACY_FILE_NAMES.map((name) => `${userId}/${name}`),
      ]);

    return { error };
  }
}
