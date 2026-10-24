export type DevicePlatform = 'android' | 'ios';

export interface DeviceRegistration {
  id: string;
  token: string;
  platform: DevicePlatform;
  active: boolean;
}

export interface DispatchSummary {
  events: number;
  recipients: number;
  attempted: number;
  sent: number;
  failed: number;
  deactivatedTokens: number;
}
