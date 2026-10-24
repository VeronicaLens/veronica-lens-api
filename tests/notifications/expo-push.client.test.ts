import { describe, expect, it, vi } from 'vitest';

import { ExpoPushClient, EXPO_PUSH_ENDPOINT } from '../../src/modules/notifications/expo-push.client.js';

const messages = [
  { to: 'ExponentPushToken[abc]', title: 'Veronica Lens', body: 'Chuva de meteoros' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ExpoPushClient', () => {
  it('posts messages to the Expo endpoint and returns the tickets', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    );
    const client = new ExpoPushClient(EXPO_PUSH_ENDPOINT, fetchImpl as unknown as typeof fetch);

    const tickets = await client.send(messages);

    expect(tickets).toEqual([{ status: 'ok', id: 'ticket-1' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      EXPO_PUSH_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(messages),
      }),
    );
  });

  it('throws when Expo answers with a non-2xx status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: [] }, 500));
    const client = new ExpoPushClient(EXPO_PUSH_ENDPOINT, fetchImpl as unknown as typeof fetch);

    await expect(client.send(messages)).rejects.toThrow('HTTP 500');
  });

  it('throws when the response has no data array', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }));
    const client = new ExpoPushClient(EXPO_PUSH_ENDPOINT, fetchImpl as unknown as typeof fetch);

    await expect(client.send(messages)).rejects.toThrow('unexpected payload');
  });

  it('lets network errors propagate to the caller', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = new ExpoPushClient(EXPO_PUSH_ENDPOINT, fetchImpl as unknown as typeof fetch);

    await expect(client.send(messages)).rejects.toThrow('fetch failed');
  });
});
