import type {
  PostgrestError,
  SupabaseClient,
} from '@supabase/supabase-js';

import type { LearningProgressStatus } from './learning.types.js';

export interface TrackRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
}

export interface LessonSummaryRow {
  id: string;
  track_id: string;
  slug: string;
  title: string;
  sort_order: number;
}

export interface LessonRow extends LessonSummaryRow {
  content: string;
}

export interface ProgressRow {
  lesson_id: string;
  status: LearningProgressStatus;
  progress_percent: number;
  completed_at: string | null;
}

export interface ProgressValues {
  status: LearningProgressStatus;
  progressPercent: number;
  completedAt: string | null;
}

export interface ListResult<T> {
  rows: T[];
  error: PostgrestError | null;
}

export interface RowResult<T> {
  row: T | null;
  error: PostgrestError | null;
}

export interface LearningModelPort {
  findTracks(accessToken: string): Promise<ListResult<TrackRow>>;
  findTrackBySlug(accessToken: string, slug: string): Promise<RowResult<TrackRow>>;
  findLessons(
    accessToken: string,
    trackId?: string,
  ): Promise<ListResult<LessonSummaryRow>>;
  findLessonById(accessToken: string, id: string): Promise<RowResult<LessonRow>>;
  findProgress(accessToken: string, userId: string): Promise<ListResult<ProgressRow>>;
  findLessonProgress(
    accessToken: string,
    userId: string,
    lessonId: string,
  ): Promise<RowResult<ProgressRow>>;
  upsertProgress(
    accessToken: string,
    userId: string,
    lessonId: string,
    values: ProgressValues,
  ): Promise<RowResult<ProgressRow>>;
}

export type LearningClient = Pick<SupabaseClient, 'from'>;

const TRACK_COLUMNS = 'id, slug, title, description, sort_order';
// Lessons are published only when their track is published as well.
const LESSON_SUMMARY_COLUMNS =
  'id, track_id, slug, title, sort_order, learning_tracks!inner(published)';
const LESSON_COLUMNS = `${LESSON_SUMMARY_COLUMNS}, content`;
const PROGRESS_COLUMNS = 'lesson_id, status, progress_percent, completed_at';

// RLS limits reads to published content and to the caller's own progress.
// The explicit filters keep admins on the same published view.
export class SupabaseLearningModel implements LearningModelPort {
  constructor(
    private readonly createClient: (accessToken: string) => LearningClient,
  ) {}

  async findTracks(accessToken: string): Promise<ListResult<TrackRow>> {
    const { data, error } = await this.createClient(accessToken)
      .from('learning_tracks')
      .select(TRACK_COLUMNS)
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    return { rows: (data ?? []) as TrackRow[], error };
  }

  async findTrackBySlug(
    accessToken: string,
    slug: string,
  ): Promise<RowResult<TrackRow>> {
    const { data, error } = await this.createClient(accessToken)
      .from('learning_tracks')
      .select(TRACK_COLUMNS)
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle<TrackRow>();

    return { row: data, error };
  }

  async findLessons(
    accessToken: string,
    trackId?: string,
  ): Promise<ListResult<LessonSummaryRow>> {
    let query = this.createClient(accessToken)
      .from('lessons')
      .select(LESSON_SUMMARY_COLUMNS)
      .eq('published', true)
      .eq('learning_tracks.published', true);

    if (trackId !== undefined) {
      query = query.eq('track_id', trackId);
    }

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    return { rows: (data ?? []) as LessonSummaryRow[], error };
  }

  async findLessonById(
    accessToken: string,
    id: string,
  ): Promise<RowResult<LessonRow>> {
    const { data, error } = await this.createClient(accessToken)
      .from('lessons')
      .select(LESSON_COLUMNS)
      .eq('id', id)
      .eq('published', true)
      .eq('learning_tracks.published', true)
      .maybeSingle<LessonRow>();

    return { row: data, error };
  }

  async findProgress(
    accessToken: string,
    userId: string,
  ): Promise<ListResult<ProgressRow>> {
    const { data, error } = await this.createClient(accessToken)
      .from('user_learning_progress')
      .select(PROGRESS_COLUMNS)
      .eq('user_id', userId);

    return { rows: (data ?? []) as ProgressRow[], error };
  }

  async findLessonProgress(
    accessToken: string,
    userId: string,
    lessonId: string,
  ): Promise<RowResult<ProgressRow>> {
    const { data, error } = await this.createClient(accessToken)
      .from('user_learning_progress')
      .select(PROGRESS_COLUMNS)
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle<ProgressRow>();

    return { row: data, error };
  }

  async upsertProgress(
    accessToken: string,
    userId: string,
    lessonId: string,
    values: ProgressValues,
  ): Promise<RowResult<ProgressRow>> {
    const { data, error } = await this.createClient(accessToken)
      .from('user_learning_progress')
      .upsert(
        {
          user_id: userId,
          lesson_id: lessonId,
          status: values.status,
          progress_percent: values.progressPercent,
          completed_at: values.completedAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select(PROGRESS_COLUMNS)
      .maybeSingle<ProgressRow>();

    return { row: data, error };
  }
}
