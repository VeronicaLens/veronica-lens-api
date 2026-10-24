import type { ObservationRating } from '../conditions/conditions.assessment.js';

export interface PlanningSample {
  at: string;
  altitudeDegrees: number;
  sunAltitudeDegrees: number;
  // Null when no weather forecast covers the sample.
  rating: ObservationRating | null;
  favorable: boolean;
}

export interface RecommendedWindow {
  from: string;
  to: string;
  peakAt: string;
  peakAltitudeDegrees: number;
}

// How many samples failed each criterion; one sample may fail several.
export interface RejectionCounts {
  belowMinimumAltitude: number;
  poorConditions: number;
}

export interface RecommendationResult {
  objectId: string;
  objectName: string;
  status: 'recommended' | 'no_favorable_window';
  window: RecommendedWindow | null;
  weatherAvailable: boolean;
  minimumAltitudeDegrees: number;
  sampleIntervalMinutes: number;
  rejections: RejectionCounts;
  samples: PlanningSample[];
}
