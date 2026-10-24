import type { PostgrestError } from '@supabase/supabase-js';

import type { AuthContext } from '../../shared/auth/auth-context.js';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logging/logger.js';
import { throwIfTokenRejected } from '../../shared/supabase/postgrest-errors.js';
import type {
  LearningModelPort,
  LessonSummaryRow,
  ProgressRow,
  ProgressValues,
  TrackRow,
} from './learning.model.js';
import type { UpdateProgressInput } from './learning.schemas.js';
import type {
  LessonDetail,
  LessonProgress,
  LessonProgressUpdate,
  LessonSummary,
  TrackDetail,
  TrackProgress,
  TrackSummary,
} from './learning.types.js';

function throwLearningError(error: PostgrestError): never {
  throwIfTokenRejected(error);
  logger.error({ providerCode: error.code }, 'Learning data error');

  throw new AppError(
    503,
    'LEARNING_UNAVAILABLE',
    'Learning content is temporarily unavailable',
  );
}

function toProgress(row: ProgressRow | null): LessonProgress {
  if (row === null) {
    return { status: 'not_started', progressPercent: 0, completedAt: null };
  }

  return {
    status: row.status,
    progressPercent: row.progress_percent,
    completedAt:
      row.completed_at === null ? null : new Date(row.completed_at).toISOString(),
  };
}

function toTrackProgress(lessons: LessonSummary[]): TrackProgress {
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter(
    (lesson) => lesson.progress.status === 'completed',
  ).length;

  return {
    totalLessons,
    completedLessons,
    percent:
      totalLessons === 0
        ? 0
        : Math.round((completedLessons * 100) / totalLessons),
  };
}

function toLessonSummary(
  row: LessonSummaryRow,
  progress: Map<string, ProgressRow>,
): LessonSummary {
  return {
    id: row.id,
    trackId: row.track_id,
    slug: row.slug,
    title: row.title,
    sortOrder: row.sort_order,
    progress: toProgress(progress.get(row.id) ?? null),
  };
}

function toTrackSummary(
  row: TrackRow,
  lessons: LessonSummary[],
): TrackSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    progress: toTrackProgress(lessons),
  };
}

function indexProgress(rows: ProgressRow[]): Map<string, ProgressRow> {
  return new Map(rows.map((row) => [row.lesson_id, row]));
}

function toProgressValues(input: UpdateProgressInput, now: Date): ProgressValues {
  switch (input.status) {
    case 'not_started':
      return { status: 'not_started', progressPercent: 0, completedAt: null };
    case 'in_progress':
      return {
        status: 'in_progress',
        progressPercent: input.progressPercent,
        completedAt: null,
      };
    case 'completed':
      return {
        status: 'completed',
        progressPercent: 100,
        completedAt: now.toISOString(),
      };
  }
}

export class LearningService {
  constructor(
    private readonly model: LearningModelPort,
    private readonly now: () => number = Date.now,
  ) {}

  async listTracks(auth: AuthContext): Promise<TrackSummary[]> {
    const tracks = await this.model.findTracks(auth.accessToken);
    if (tracks.error) throwLearningError(tracks.error);

    const lessons = await this.model.findLessons(auth.accessToken);
    if (lessons.error) throwLearningError(lessons.error);

    const progress = await this.model.findProgress(auth.accessToken, auth.user.id);
    if (progress.error) throwLearningError(progress.error);

    const progressByLesson = indexProgress(progress.rows);

    return tracks.rows.map((track) => {
      const trackLessons = lessons.rows
        .filter((lesson) => lesson.track_id === track.id)
        .map((lesson) => toLessonSummary(lesson, progressByLesson));

      return toTrackSummary(track, trackLessons);
    });
  }

  async getTrackBySlug(auth: AuthContext, slug: string): Promise<TrackDetail> {
    const track = await this.model.findTrackBySlug(auth.accessToken, slug);
    if (track.error) throwLearningError(track.error);

    if (!track.row) {
      throw new AppError(404, 'TRACK_NOT_FOUND', 'Learning track was not found');
    }

    const lessons = await this.model.findLessons(auth.accessToken, track.row.id);
    if (lessons.error) throwLearningError(lessons.error);

    const progress = await this.model.findProgress(auth.accessToken, auth.user.id);
    if (progress.error) throwLearningError(progress.error);

    const progressByLesson = indexProgress(progress.rows);
    const trackLessons = lessons.rows.map((lesson) =>
      toLessonSummary(lesson, progressByLesson),
    );

    return {
      ...toTrackSummary(track.row, trackLessons),
      lessons: trackLessons,
    };
  }

  async getLessonById(auth: AuthContext, id: string): Promise<LessonDetail> {
    const lesson = await this.model.findLessonById(auth.accessToken, id);
    if (lesson.error) throwLearningError(lesson.error);

    if (!lesson.row) {
      throw new AppError(404, 'LESSON_NOT_FOUND', 'Learning lesson was not found');
    }

    const progress = await this.model.findLessonProgress(
      auth.accessToken,
      auth.user.id,
      id,
    );
    if (progress.error) throwLearningError(progress.error);

    return {
      ...toLessonSummary(lesson.row, new Map()),
      content: lesson.row.content,
      progress: toProgress(progress.row),
    };
  }

  async updateProgress(
    auth: AuthContext,
    lessonId: string,
    input: UpdateProgressInput,
  ): Promise<LessonProgressUpdate> {
    const lesson = await this.model.findLessonById(auth.accessToken, lessonId);
    if (lesson.error) throwLearningError(lesson.error);

    if (!lesson.row) {
      throw new AppError(404, 'LESSON_NOT_FOUND', 'Learning lesson was not found');
    }

    const values = toProgressValues(input, new Date(this.now()));
    const saved = await this.model.upsertProgress(
      auth.accessToken,
      auth.user.id,
      lessonId,
      values,
    );
    if (saved.error) throwLearningError(saved.error);

    if (!saved.row) {
      throw new AppError(
        503,
        'LEARNING_UNAVAILABLE',
        'Learning content is temporarily unavailable',
      );
    }

    return { lessonId, ...toProgress(saved.row) };
  }
}
