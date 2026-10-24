import type {
  PostgrestError,
  SupabaseClient,
} from '@supabase/supabase-js';

import type {
  DevicePlatform,
  DeviceRegistration,
} from './notifications.types.js';

export interface DeviceResult {
  row: DeviceRegistration | null;
  error: PostgrestError | null;
}

export interface DeviceModelPort {
  registerDevice(
    accessToken: string,
    userId: string,
    input: { token: string; platform: DevicePlatform },
  ): Promise<DeviceResult>;
  removeDevice(accessToken: string, token: string): Promise<{ error: PostgrestError | null }>;
}

export type DeviceClient = Pick<SupabaseClient, 'from'>;

const DEVICE_COLUMNS = 'id, token, platform, active';

// RLS restricts every statement to the caller's own tokens. A token already
// owned by another user makes the upsert fail with 42501 (mapped in the service).
export class SupabaseDeviceModel implements DeviceModelPort {
  constructor(
    private readonly createClient: (accessToken: string) => DeviceClient,
  ) {}

  async registerDevice(
    accessToken: string,
    userId: string,
    input: { token: string; platform: DevicePlatform },
  ): Promise<DeviceResult> {
    const { data, error } = await this.createClient(accessToken)
      .from('device_push_tokens')
      .upsert(
        {
          user_id: userId,
          token: input.token,
          platform: input.platform,
          active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )
      .select(DEVICE_COLUMNS)
      .maybeSingle<DeviceRegistration>();

    return { row: data, error };
  }

  async removeDevice(
    accessToken: string,
    token: string,
  ): Promise<{ error: PostgrestError | null }> {
    const { error } = await this.createClient(accessToken)
      .from('device_push_tokens')
      .delete()
      .eq('token', token);

    return { error };
  }
}
