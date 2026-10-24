export type LearningProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  status: LearningProgressStatus;
  progressPercent: number;
  completedAt: string | null;
}

export interface TrackProgress {
  totalLessons: number;
  completedLessons: number;
  percent: number;
}

export interface TrackSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  progress: TrackProgress;
}

export interface LessonSummary {
  id: string;
  trackId: string;
  slug: string;
  title: string;
  sortOrder: number;
  progress: LessonProgress;
}

export interface TrackDetail extends TrackSummary {
  lessons: LessonSummary[];
}

export interface LessonDetail extends LessonSummary {
  content: string;
}

export interface LessonProgressUpdate extends LessonProgress {
  lessonId: string;
}
