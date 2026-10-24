import { describe, expect, it, vi } from 'vitest';

import {
  SupabaseLearningModel,
  type LearningClient,
} from '../../src/modules/learning/learning.model.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const TRACK_ID = '40000000-0000-4000-8000-000000000001';
const LESSON_ID = '50000000-0000-4000-8000-000000000001';

function setup(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    'select',
    'eq',
    'order',
    'upsert',
    'maybeSingle',
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle.mockResolvedValue(result);
  query.then = vi.fn((onFulfilled) => Promise.resolve(result).then(onFulfilled));

  const client = { from: vi.fn(() => query) };
  const createClient = vi.fn((_token: string) => client as unknown as LearningClient);

  return { query, client, createClient, model: new SupabaseLearningModel(createClient) };
}

describe('SupabaseLearningModel.findTracks', () => {
  it('reads only published tracks in display order', async () => {
    const { query, client, createClient, model } = setup({ data: [], error: null });

    await expect(model.findTracks('test-access-token')).resolves.toEqual({
      rows: [],
      error: null,
    });

    expect(createClient).toHaveBeenCalledExactlyOnceWith('test-access-token');
    expect(client.from).toHaveBeenCalledWith('learning_tracks');
    expect(query.eq).toHaveBeenCalledWith('published', true);
    expect(query.order.mock.calls).toEqual([
      ['sort_order', { ascending: true }],
      ['id', { ascending: true }],
    ]);
  });
});

describe('SupabaseLearningModel.findTrackBySlug', () => {
  it('filters by slug and published flag and returns null when missing', async () => {
    const { query, model } = setup({ data: null, error: null });

    await expect(model.findTrackBySlug('test-access-token', 'constelacoes')).resolves.toEqual({
      row: null,
      error: null,
    });

    expect(query.eq.mock.calls).toEqual([
      ['slug', 'constelacoes'],
      ['published', true],
    ]);
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });
});

describe('SupabaseLearningModel.findLessons', () => {
  it('requires the parent track to be published through the embed filter', async () => {
    const { query, client, model } = setup({ data: [], error: null });

    await model.findLessons('test-access-token');

    expect(client.from).toHaveBeenCalledWith('lessons');
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('learning_tracks!inner(published)'),
    );
    expect(query.eq.mock.calls).toEqual([
      ['published', true],
      ['learning_tracks.published', true],
    ]);
  });

  it('filters by track when a track id is given', async () => {
    const { query, model } = setup({ data: [], error: null });

    await model.findLessons('test-access-token', TRACK_ID);

    expect(query.eq).toHaveBeenCalledWith('track_id', TRACK_ID);
  });
});

describe('SupabaseLearningModel.findLessonById', () => {
  it('reads content only for published lessons of published tracks', async () => {
    const { query, model } = setup({ data: null, error: null });

    await model.findLessonById('test-access-token', LESSON_ID);

    expect(query.select).toHaveBeenCalledWith(expect.stringContaining('content'));
    expect(query.eq.mock.calls).toEqual([
      ['id', LESSON_ID],
      ['published', true],
      ['learning_tracks.published', true],
    ]);
  });
});

describe('SupabaseLearningModel.findProgress', () => {
  it('reads progress only for the given user', async () => {
    const { query, model } = setup({ data: [], error: null });

    await model.findProgress('test-access-token', USER_ID);

    expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });
});

describe('SupabaseLearningModel.upsertProgress', () => {
  it('upserts on the user and lesson pair and stamps updated_at', async () => {
    const row = {
      lesson_id: LESSON_ID,
      status: 'in_progress' as const,
      progress_percent: 40,
      completed_at: null,
    };
    const { query, model } = setup({ data: row, error: null });

    await expect(
      model.upsertProgress('test-access-token', USER_ID, LESSON_ID, {
        status: 'in_progress',
        progressPercent: 40,
        completedAt: null,
      }),
    ).resolves.toEqual({ row, error: null });

    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        lesson_id: LESSON_ID,
        status: 'in_progress',
        progress_percent: 40,
        completed_at: null,
        updated_at: expect.any(String),
      }),
      { onConflict: 'user_id,lesson_id' },
    );
    expect(query.maybeSingle).toHaveBeenCalledOnce();
  });
});
