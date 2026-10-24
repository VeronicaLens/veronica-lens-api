import type { ConnectivityProbe, ProbeResult } from './health.probe.js';

export interface ConnectivityReport {
  status: 'ok' | 'degraded';
  checks: { supabase: ProbeResult };
  timestamp: string;
}

export class HealthService {
  constructor(private readonly supabaseProbe: ConnectivityProbe) {}

  async getConnectivity(): Promise<ConnectivityReport> {
    const supabase = await this.supabaseProbe.check();

    return {
      status: supabase.status === 'up' ? 'ok' : 'degraded',
      checks: { supabase },
      timestamp: new Date().toISOString(),
    };
  }
}
