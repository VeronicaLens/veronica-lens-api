import type {
  PostgrestError,
  SupabaseClient,
} from '@supabase/supabase-js';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  location_name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  notifications_enabled: boolean;
  measurement_unit: 'metric' | 'imperial';
  language: 'pt-BR' | 'en';
  created_at: string;
  updated_at: string;
}

export interface ProfileChanges {
  display_name?: string | null;
  avatar_url?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notifications_enabled?: boolean;
  measurement_unit?: 'metric' | 'imperial';
  language?: 'pt-BR' | 'en';
}

export interface ProfileResult {
  profile: ProfileRow | null;
  error: PostgrestError | null;
}

export interface ProfileModelPort {
  findById(accessToken: string, userId: string): Promise<ProfileResult>;
  update(
    accessToken: string,
    userId: string,
    changes: ProfileChanges,
  ): Promise<ProfileResult>;
}

export type ProfileClient = Pick<SupabaseClient, 'from'>;

const PROFILE_COLUMNS =
  'id, display_name, avatar_url, location_name, latitude, longitude, notifications_enabled, measurement_unit, language, created_at, updated_at';

// Queries run with the user's JWT so that RLS policies apply.
export class SupabaseProfileModel implements ProfileModelPort {
  constructor(
    private readonly createClient: (accessToken: string) => ProfileClient,
  ) {}

  async findById(
    accessToken: string,
    userId: string,
  ): Promise<ProfileResult> {
    const { data, error } = await this.createClient(accessToken)
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle<ProfileRow>();

    return { profile: data, error };
  }

  async update(
    accessToken: string,
    userId: string,
    changes: ProfileChanges,
  ): Promise<ProfileResult> {
    const { data, error } = await this.createClient(accessToken)
      .from('profiles')
      .update(changes)
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle<ProfileRow>();

    return { profile: data, error };
  }
}
