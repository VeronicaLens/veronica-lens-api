import type { PostgrestError, User } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import type { LessonRow, TrackRow, ProgressRow } from '../../src/modules/learning/learning.model.js';
import { createAppMocks } from '../helpers/mocks.js';

const bearer = 'Bearer test-access-token';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const TRACK_ID = '40000000-0000-4000-8000-000000000001';
const LESSON_ID = '50000000-0000-4000-8000-000000000001';

const track: TrackRow = {
  id: TRACK_ID,
  slug: 'constelacoes',
  title: 'Constelações',
  description: 'Aprenda a reconhecer o céu.',
  sort_order: 1,
};

const lessonSummary = {
  id: LESSON_ID,
  track_id: TRACK_ID,
  slug: 'orion',
  title: 'Orion',
  sort_order: 1,
};

const lesson: LessonRow = { ...lessonSummary, content: 'Conteúdo da lição.' };

function createUser(): User {
  return {
    id: USER_ID,
    email: 'user@example.com',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function postgrestError(code: string): PostgrestError {
  return { name: 'PostgrestError', code, message: 'Internal details', details: '', hint: '' } as PostgrestError;
}

function setup() {
  const mocks = createAppMocks();

  mocks.authModel.getUser.mockResolvedValue({ user: createUser(), error: null });
  mocks.learningModel.findTracks.mockResolvedValue({ rows: [track], error: null });
  mocks.learningModel.findTrackBySlug.mockResolvedValue({ row: track, error: null });
  mocks.learningModel.findLessons.mockResolvedValue({ rows: [lessonSummary], error: null });
  mocks.learningModel.findLessonById.mockResolvedValue({ row: lesson, error: null });
  mocks.learningModel.findProgress.mockResolvedValue({ rows: [], error: null });
  mocks.learningModel.findLessonProgress.mockResolvedValue({ row: null, error: null });
  mocks.learningModel.upsertProgress.mockImplementation(async (_token, _user, lessonId, values) => ({
    row: {
      lesson_id: lessonId,
      status: values.status,
      progress_percent: values.progressPercent,
      completed_at: values.completedAt,
    } satisfies ProgressRow,
    error: null,
  }));

  return { ...mocks, app: createApp(mocks) };
}

describe('GET /api/v1/learning/tracks', () => {
  it('lists published tracks with lesson progress summary', async () => {
    const { app, learningModel } = setup();
    learningModel.findProgress.mockResolvedValue({
      rows: [
        {
          lesson_id: LESSON_ID,
          status: 'completed',
          progress_percent: 100,
          completed_at: '2026-05-01T10:00:00+00:00',
        },
      ],
      error: null,
    });

    const response = await request(app)
      .get('/api/v1/learning/tracks')
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.tracks).toEqual([
      {
        id: TRACK_ID,
        slug: 'constelacoes',
        title: 'Constelações',
        description: 'Aprenda a reconhecer o céu.',
        sortOrder: 1,
        progress: { totalLessons: 1, completedLessons: 1, percent: 100 },
      },
    ]);
    expect(response.body.meta).toEqual({ count: 1 });
    expect(learningModel.findProgress).toHaveBeenCalledWith('test-access-token', USER_ID);
  });

  it('returns 401 without a bearer token', async () => {
    const { app, learningModel } = setup();

    await request(app).get('/api/v1/learning/tracks').expect(401);

    expect(learningModel.findTracks).not.toHaveBeenCalled();
  });

  it('returns 503 when content cannot be read', async () => {
    const { app, learningModel } = setup();
    learningModel.findTracks.mockResolvedValue({ rows: [], error: postgrestError('500') });

    const response = await request(app)
      .get('/api/v1/learning/tracks')
      .set('Authorization', bearer)
      .expect(503);

    expect(response.body.error.code).toBe('LEARNING_UNAVAILABLE');
  });
});

describe('GET /api/v1/learning/tracks/:slug', () => {
  it('returns the track with its lessons', async () => {
    const { app, learningModel } = setup();

    const response = await request(app)
      .get('/api/v1/learning/tracks/constelacoes')
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.track).toMatchObject({
      id: TRACK_ID,
      slug: 'constelacoes',
      progress: { totalLessons: 1, completedLessons: 0, percent: 0 },
      lessons: [
        {
          id: LESSON_ID,
          slug: 'orion',
          progress: { status: 'not_started', progressPercent: 0, completedAt: null },
        },
      ],
    });
    expect(learningModel.findLessons).toHaveBeenCalledWith('test-access-token', TRACK_ID);
  });

  it('returns 404 for an unknown track', async () => {
    const { app, learningModel } = setup();
    learningModel.findTrackBySlug.mockResolvedValue({ row: null, error: null });

    const response = await request(app)
      .get('/api/v1/learning/tracks/inexistente')
      .set('Authorization', bearer)
      .expect(404);

    expect(response.body.error.code).toBe('TRACK_NOT_FOUND');
  });

  it('returns 404 for a malformed slug without querying the database', async () => {
    const { app, learningModel } = setup();

    await request(app)
      .get('/api/v1/learning/tracks/Nao_Valido!')
      .set('Authorization', bearer)
      .expect(404);

    expect(learningModel.findTrackBySlug).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/learning/lessons/:id', () => {
  it('returns the lesson content with the caller progress', async () => {
    const { app } = setup();

    const response = await request(app)
      .get(`/api/v1/learning/lessons/${LESSON_ID}`)
      .set('Authorization', bearer)
      .expect(200);

    expect(response.body.data.lesson).toMatchObject({
      id: LESSON_ID,
      content: 'Conteúdo da lição.',
      progress: { status: 'not_started', progressPercent: 0, completedAt: null },
    });
  });

  it('returns 404 for an unpublished or missing lesson', async () => {
    const { app, learningModel } = setup();
    learningModel.findLessonById.mockResolvedValue({ row: null, error: null });

    const response = await request(app)
      .get(`/api/v1/learning/lessons/${LESSON_ID}`)
      .set('Authorization', bearer)
      .expect(404);

    expect(response.body.error.code).toBe('LESSON_NOT_FOUND');
  });

  it('returns 404 for a malformed id without querying the database', async () => {
    const { app, learningModel } = setup();

    await request(app)
      .get('/api/v1/learning/lessons/nao-e-uuid')
      .set('Authorization', bearer)
      .expect(404);

    expect(learningModel.findLessonById).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/learning/lessons/:id/progress', () => {
  it('saves in_progress with the given percent', async () => {
    const { app, learningModel } = setup();

    const response = await request(app)
      .put(`/api/v1/learning/lessons/${LESSON_ID}/progress`)
      .set('Authorization', bearer)
      .send({ status: 'in_progress', progressPercent: 40 })
      .expect(200);

    expect(response.body.data.progress).toEqual({
      lessonId: LESSON_ID,
      status: 'in_progress',
      progressPercent: 40,
      completedAt: null,
    });
    expect(learningModel.upsertProgress).toHaveBeenCalledWith(
      'test-access-token',
      USER_ID,
      LESSON_ID,
      { status: 'in_progress', progressPercent: 40, completedAt: null },
    );
  });

  it('marks completed as 100 percent with a completion timestamp', async () => {
    const { app, learningModel } = setup();

    const response = await request(app)
      .put(`/api/v1/learning/lessons/${LESSON_ID}/progress`)
      .set('Authorization', bearer)
      .send({ status: 'completed' })
      .expect(200);

    expect(response.body.data.progress).toMatchObject({
      status: 'completed',
      progressPercent: 100,
    });
    expect(response.body.data.progress.completedAt).toEqual(expect.any(String));
    const [, , , values] = learningModel.upsertProgress.mock.calls[0];
    expect(values.progressPercent).toBe(100);
    expect(values.completedAt).not.toBeNull();
  });

  it('resets to not_started with zero percent and no completion date', async () => {
    const { app, learningModel } = setup();

    await request(app)
      .put(`/api/v1/learning/lessons/${LESSON_ID}/progress`)
      .set('Authorization', bearer)
      .send({ status: 'not_started' })
      .expect(200);

    const [, , , values] = learningModel.upsertProgress.mock.calls[0];
    expect(values).toEqual({ status: 'not_started', progressPercent: 0, completedAt: null });
  });

  it('rejects in_progress without a percent', async () => {
    const { app, learningModel } = setup();

    await request(app)
      .put(`/api/v1/learning/lessons/${LESSON_ID}/progress`)
      .set('Authorization', bearer)
      .send({ status: 'in_progress' })
      .expect(400);

    expect(learningModel.upsertProgress).not.toHaveBeenCalled();
  });

  it('rejects in_progress at 100 percent, which must be completed instead', async () => {
    const { app } = setup();

    await request(app)
      .put(`/api/v1/learning/lessons/${LESSON_ID}/progress`)
      .set('Authorization', bearer)
      .send({ status: 'in_progress', progressPercent: 100 })
      .expect(400);
  });

  it('returns 404 when the lesson is not published', async () => {
    const { app, learningModel } = setup();
    learningModel.findLessonById.mockResolvedValue({ row: null, error: null });

    const response = await request(app)
      .put(`/api/v1/learning/lessons/${LESSON_ID}/progress`)
      .set('Authorization', bearer)
      .send({ status: 'completed' })
      .expect(404);

    expect(response.body.error.code).toBe('LESSON_NOT_FOUND');
    expect(learningModel.upsertProgress).not.toHaveBeenCalled();
  });
});
