import { describe, expect, it } from 'vitest';

import {
  SupabaseDispatchModel,
  type DispatchClient,
} from '../../src/modules/notifications/notifications.dispatch-model.js';

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

interface FakeOptions {
  // Mirrors PostgREST max_rows: responses are truncated silently at this size.
  maxRows?: number;
  failWith?: string;
}

// Minimal chainable stand-in for the Supabase query builder. Records every
// call and applies range() windows the way PostgREST does.
function fakeClient(
  tables: Record<string, Record<string, unknown>[]>,
  options: FakeOptions = {},
) {
  const calls: Call[] = [];
  const maxRows = options.maxRows ?? 1000;

  const from = (table: string) => {
    let op = 'select';
    let window: [number, number] | undefined;
    let payload: unknown[] = [];
    const inFilters: [string, unknown[]][] = [];

    const builder = {
      select(..._args: unknown[]) {
        calls.push({ table, method: 'select', args: _args });
        return builder;
      },
      eq(..._args: unknown[]) {
        calls.push({ table, method: 'eq', args: _args });
        return builder;
      },
      gte(..._args: unknown[]) {
        calls.push({ table, method: 'gte', args: _args });
        return builder;
      },
      lte(..._args: unknown[]) {
        calls.push({ table, method: 'lte', args: _args });
        return builder;
      },
      order(..._args: unknown[]) {
        calls.push({ table, method: 'order', args: _args });
        return builder;
      },
      in(column: string, values: unknown[]) {
        calls.push({ table, method: 'in', args: [column, values] });
        inFilters.push([column, values]);
        return builder;
      },
      range(rangeFrom: number, rangeTo: number) {
        calls.push({ table, method: 'range', args: [rangeFrom, rangeTo] });
        window = [rangeFrom, rangeTo];
        return builder;
      },
      upsert(rows: unknown[]) {
        op = 'upsert';
        payload = rows;
        calls.push({ table, method: 'upsert', args: [rows] });
        return builder;
      },
      update(values: unknown) {
        op = 'update';
        calls.push({ table, method: 'update', args: [values] });
        return builder;
      },
      then(resolve: (value: unknown) => void) {
        resolve(resolveResult());
      },
    };

    const resolveResult = () => {
      if (options.failWith) {
        return { data: null, error: { code: options.failWith, message: 'boom' } };
      }

      if (op === 'upsert') {
        const data = payload.map((row) => {
          const r = row as Record<string, string>;
          return {
            id: `${r.astronomical_event_id}:${r.device_push_token_id}`,
            astronomical_event_id: r.astronomical_event_id,
            device_push_token_id: r.device_push_token_id,
          };
        });
        return { data, error: null };
      }

      if (op === 'update') {
        return { data: null, error: null };
      }

      const rows = (tables[table] ?? []).filter((row) =>
        inFilters.every(([column, values]) => values.includes(row[column])),
      );
      if (window === undefined) {
        return { data: rows.slice(0, maxRows), error: null };
      }

      const [start, end] = window;
      const take = Math.min(end + 1 - start, maxRows);
      return { data: rows.slice(start, start + take), error: null };
    };

    return builder;
  };

  return {
    client: { from } as unknown as DispatchClient,
    calls,
  };
}

function events(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `event-${i}`,
    title: `Event ${i}`,
    event_type: 'meteor',
    starts_at: '2026-10-25T00:00:00.000Z',
  }));
}

describe('SupabaseDispatchModel', () => {
  const from = new Date('2026-10-24T00:00:00.000Z');
  const until = new Date('2026-11-23T00:00:00.000Z');

  it('reads every upcoming event when the response cap is 1000 rows', async () => {
    const { client } = fakeClient({ astronomical_events: events(2500) });
    const model = new SupabaseDispatchModel(client);

    const rows = await model.findUpcomingEvents(from, until);

    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2500);
  });

  it('keeps paging correctly when the project cap is lower than the page size', async () => {
    const { client } = fakeClient({ astronomical_events: events(1200) }, { maxRows: 500 });
    const model = new SupabaseDispatchModel(client);

    const rows = await model.findUpcomingEvents(from, until);

    expect(rows.map((row) => row.id)).toEqual(events(1200).map((row) => row.id));
  });

  it('splits user id filters into batches of 100 and reads all tokens', async () => {
    const userIds = Array.from({ length: 250 }, (_, i) => `user-${i}`);
    const tokens = userIds.map((user, i) => ({
      id: `token-${i}`,
      user_id: user,
      token: `ExponentPushToken[${i}]`,
      platform: 'android',
    }));
    const { client, calls } = fakeClient({ device_push_tokens: tokens });
    const model = new SupabaseDispatchModel(client);

    const rows = await model.findActiveTokens(userIds);

    const inCalls = calls.filter((call) => call.method === 'in');
    const batches = new Set(inCalls.map((call) => JSON.stringify(call.args[1])));
    expect(batches.size).toBe(3);
    for (const batch of batches) {
      expect((JSON.parse(batch) as string[]).length).toBeLessThanOrEqual(100);
    }
    expect(rows).toHaveLength(250);
  });

  it('batches preference lookups by event type', async () => {
    const types = Array.from({ length: 150 }, (_, i) => `type-${i}`);
    const { client, calls } = fakeClient({ event_preferences: [] });
    const model = new SupabaseDispatchModel(client);

    await model.findEnabledPreferences(types);

    const inCalls = calls.filter((call) => call.method === 'in');
    const batches = new Set(inCalls.map((call) => JSON.stringify(call.args[1])));
    expect(batches.size).toBe(2);
    expect(inCalls.every((call) => call.args[0] === 'event_type')).toBe(true);
  });

  it('inserts deliveries in batches of 500 and returns every inserted row', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      astronomical_event_id: `event-${i}`,
      device_push_token_id: `token-${i}`,
      user_id: `user-${i}`,
    }));
    const { client, calls } = fakeClient({});
    const model = new SupabaseDispatchModel(client);

    const inserted = await model.insertPendingDeliveries(rows);

    const upserts = calls.filter((call) => call.method === 'upsert');
    expect(upserts).toHaveLength(3);
    expect(inserted).toHaveLength(1200);
  });

  it('deactivates tokens in batches of 100', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `token-${i}`);
    const { client, calls } = fakeClient({});
    const model = new SupabaseDispatchModel(client);

    await model.deactivateTokens(ids);

    expect(calls.filter((call) => call.method === 'update')).toHaveLength(2);
  });

  it('aborts the read when a page fails, so no partial dispatch runs', async () => {
    const { client } = fakeClient({ astronomical_events: events(5) }, { failWith: '57014' });
    const model = new SupabaseDispatchModel(client);

    await expect(model.findUpcomingEvents(from, until)).rejects.toThrow(
      'Dispatch query failed: 57014',
    );
  });
});
