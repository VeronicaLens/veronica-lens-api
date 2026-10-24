export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type PushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushTicket[]>;
}

export const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
// Expo accepts up to 100 messages per request.
export const EXPO_PUSH_CHUNK_SIZE = 100;
const REQUEST_TIMEOUT_MS = 10_000;

export class ExpoPushClient implements PushSender {
  constructor(
    private readonly endpoint: string = EXPO_PUSH_ENDPOINT,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  // Throws when Expo cannot be reached or answers with a non-2xx status.
  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Expo push responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { data?: PushTicket[] };

    if (!Array.isArray(payload.data)) {
      throw new Error('Expo push returned an unexpected payload');
    }

    return payload.data;
  }
}
