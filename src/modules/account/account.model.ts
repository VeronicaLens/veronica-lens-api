import type { SupabaseClient } from '@supabase/supabase-js';

export type UserBucket = 'avatars' | 'observations';

// Provider errors reduced to safe fields for logging; messages are dropped.
export interface AccountProviderError {
  source: 'database' | 'storage' | 'auth';
  code?: string;
  status?: number;
}

export interface PathsResult {
  paths: string[];
  error: AccountProviderError | null;
}

export interface AccountOperationResult {
  error: AccountProviderError | null;
}

export interface AccountModelPort {
  listObservationMediaPaths(userId: string): Promise<PathsResult>;
  listAvatarPaths(userId: string): Promise<PathsResult>;
  removeFiles(
    bucket: UserBucket,
    paths: readonly string[],
  ): Promise<AccountOperationResult>;
  deleteUser(userId: string): Promise<AccountOperationResult>;
}

export type AdminClient = Pick<SupabaseClient, 'from' | 'storage' | 'auth'>;

const PAGE_SIZE = 100;

// Uses the secret key: bypasses RLS and Storage policies. Every query must be
// scoped to the user being deleted.
export class SupabaseAccountModel implements AccountModelPort {
  constructor(private readonly createClient: () => AdminClient) {}

  async listObservationMediaPaths(userId: string): Promise<PathsResult> {
    const client = this.createClient();
    const paths: string[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await client
        .from('observation_media')
        .select('storage_path')
        .eq('user_id', userId)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return { paths: [], error: { source: 'database', code: error.code } };
      }

      const rows = (data ?? []) as { storage_path: string }[];
      paths.push(...rows.map((row) => row.storage_path));

      if (rows.length < PAGE_SIZE) {
        return { paths, error: null };
      }
    }
  }

  async listAvatarPaths(userId: string): Promise<PathsResult> {
    const bucket = this.createClient().storage.from('avatars');
    const paths: string[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(userId, {
        limit: PAGE_SIZE,
        offset,
      });

      if (error) {
        return {
          paths: [],
          error: { source: 'storage', status: error.status },
        };
      }

      paths.push(...data.map((file) => `${userId}/${file.name}`));

      if (data.length < PAGE_SIZE) {
        return { paths, error: null };
      }
    }
  }

  async removeFiles(
    bucketName: UserBucket,
    paths: readonly string[],
  ): Promise<AccountOperationResult> {
    const bucket = this.createClient().storage.from(bucketName);

    for (let index = 0; index < paths.length; index += PAGE_SIZE) {
      const { error } = await bucket.remove(
        paths.slice(index, index + PAGE_SIZE),
      );

      if (error) {
        return { error: { source: 'storage', status: error.status } };
      }
    }

    return { error: null };
  }

  async deleteUser(userId: string): Promise<AccountOperationResult> {
    const { error } = await this.createClient().auth.admin.deleteUser(userId);

    if (error && error.code !== 'user_not_found') {
      return {
        error: { source: 'auth', code: error.code, status: error.status },
      };
    }

    return { error: null };
  }
}
