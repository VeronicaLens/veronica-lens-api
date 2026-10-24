export interface ObservationCaptureSummary {
  deviceName: string | null;
  iso: number | null;
  exposureTimeSeconds: number | null;
  exposureCompensationEv: number | null;
  focusMode: string | null;
  focusLensPosition: number | null;
  whiteBalanceKelvin: number | null;
}

export interface ObservationHistoryPhoto {
  id: string;
  storagePath: string;
  capturedAt: string | null;
  thumbnailUrl: string | null;
  capture: ObservationCaptureSummary | null;
}

export interface ObservationHistoryItem {
  id: string;
  title: string;
  notes: string;
  celestialObjectName: string | null;
  observedAt: string;
  latitude: number | null;
  longitude: number | null;
  photos: ObservationHistoryPhoto[];
}

export interface ObservationHistoryPage {
  observations: ObservationHistoryItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ObservationPhotoResult {
  observationId: string;
  photoId: string;
  storagePath: string;
  capturedAt: string;
}
