import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { summarizeCaptureMetadata } from './observations.capture.js';
import type { ObservationPhotoContentType } from './observation-photo.js';
import type { ObservationPhotoMetadata } from './observations.schemas.js';
import type {
  ObservationHistoryItem,
  ObservationHistoryPage,
  ObservationPhotoResult,
} from './observations.types.js';

export type ObservationsClient = Pick<SupabaseClient, 'from' | 'storage'>;

type ObservationsBucket = ReturnType<ObservationsClient['storage']['from']>;

type StorageError = NonNullable<
  Awaited<ReturnType<ObservationsBucket['upload']>>['error']
>;

export type ObservationStoreFailure =
  | { source: 'database'; error: PostgrestError }
  | { source: 'storage'; error: StorageError };

// Carries provider errors out of the model so the service maps them to HTTP responses.
export class ObservationStoreError extends Error {
  constructor(readonly failure: ObservationStoreFailure) {
    super(`Observation ${failure.source} request failed`);
    this.name = 'ObservationStoreError';
  }
}

export interface ListObservationHistoryInput {
  userId: string;
  page: number;
  pageSize: number;
}

export interface SaveObservationPhotoInput {
  observationId: string;
  photoId: string;
  userId: string;
  contentType: ObservationPhotoContentType;
  bytes: Buffer;
  metadata: ObservationPhotoMetadata;
}

export interface DeleteObservationPhotoInput {
  observationId: string;
  photoId: string;
  userId: string;
}

export interface DeleteObservationInput {
  observationId: string;
  userId: string;
}

export interface DeleteObservationPhotoResult {
  observationDeleted: boolean;
}

export interface ObservationsModelPort {
  list(
    accessToken: string,
    input: ListObservationHistoryInput,
  ): Promise<ObservationHistoryPage>;
  savePhoto(
    accessToken: string,
    input: SaveObservationPhotoInput,
  ): Promise<ObservationPhotoResult>;
  // Resolves to null when the photo does not belong to the user.
  deletePhoto(
    accessToken: string,
    input: DeleteObservationPhotoInput,
  ): Promise<DeleteObservationPhotoResult | null>;
  // Resolves to false when the observation does not belong to the user.
  deleteObservation(
    accessToken: string,
    input: DeleteObservationInput,
  ): Promise<boolean>;
}

const BUCKET = 'observations';
const LIST_COLUMNS =
  'id, title, notes, celestial_object_name, observed_at, latitude, longitude, observation_media(id, storage_path, captured_at, capture_metadata)';
// Long enough for a gallery session; every history request issues fresh URLs.
const SIGNED_PHOTO_URL_TTL_SECONDS = 60 * 60;

interface ObservationHistoryRow {
  id: string;
  title: string;
  notes: string;
  celestial_object_name: string | null;
  observed_at: string;
  latitude: number | string | null;
  longitude: number | string | null;
  observation_media: Array<{
    id: string;
    storage_path: string;
    captured_at: string | null;
    capture_metadata?: unknown;
  }> | null;
}

// Runs with the user's JWT, so RLS limits every query to the user's own rows.
export class SupabaseObservationsModel implements ObservationsModelPort {
  constructor(
    private readonly createClient: (accessToken: string) => ObservationsClient,
  ) {}

  async list(
    accessToken: string,
    input: ListObservationHistoryInput,
  ): Promise<ObservationHistoryPage> {
    const client = this.createClient(accessToken);
    const start = (input.page - 1) * input.pageSize;
    // Fetches one extra row to learn whether another page exists.
    const { data, error } = await client
      .from('observations')
      .select(LIST_COLUMNS)
      .eq('user_id', input.userId)
      .order('observed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + input.pageSize);
    if (error) throw databaseFailure(error);

    const rows = (data ?? []) as unknown as ObservationHistoryRow[];
    const rowsForPage = rows.slice(0, input.pageSize);
    const thumbnailUrlByPath = await this.signPhotoUrls(client, rowsForPage);

    return {
      observations: rowsForPage.map((row) => toHistoryItem(row, thumbnailUrlByPath)),
      page: input.page,
      pageSize: input.pageSize,
      hasMore: rows.length > input.pageSize,
    };
  }

  async savePhoto(
    accessToken: string,
    input: SaveObservationPhotoInput,
  ): Promise<ObservationPhotoResult> {
    const client = this.createClient(accessToken);
    const storagePath = `${input.userId}/${input.observationId}/${input.photoId}.${extensionFor(input.contentType)}`;

    const { error: observationError } = await client
      .from('observations')
      .upsert(
        {
          id: input.observationId,
          user_id: input.userId,
          astronomical_event_id: input.metadata.astronomicalEventId ?? null,
          title: input.metadata.title,
          notes: input.metadata.notes,
          celestial_object_name: input.metadata.celestialObjectName ?? null,
          observed_at: input.metadata.capturedAt,
          latitude: input.metadata.latitude ?? null,
          longitude: input.metadata.longitude ?? null,
        },
        { onConflict: 'id' },
      );
    if (observationError) throw databaseFailure(observationError);

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, input.bytes, {
        contentType: input.contentType,
        upsert: true,
      });
    if (uploadError) throw storageFailure(uploadError);

    const { error: mediaError } = await client.from('observation_media').upsert(
      {
        id: input.photoId,
        observation_id: input.observationId,
        user_id: input.userId,
        storage_path: storagePath,
        media_type: 'image',
        captured_at: input.metadata.capturedAt,
        capture_metadata: {
          device: input.metadata.device,
          parameters: input.metadata.parameters,
        },
      },
      { onConflict: 'id' },
    );
    if (mediaError) {
      // Keeps storage free of files that have no metadata row.
      await client.storage.from(BUCKET).remove([storagePath]);
      throw databaseFailure(mediaError);
    }

    return {
      observationId: input.observationId,
      photoId: input.photoId,
      storagePath,
      capturedAt: input.metadata.capturedAt,
    };
  }

  // The file is removed before its row, so a failed attempt can be retried without orphans.
  async deletePhoto(
    accessToken: string,
    input: DeleteObservationPhotoInput,
  ): Promise<DeleteObservationPhotoResult | null> {
    const client = this.createClient(accessToken);

    const { data: media, error } = await client
      .from('observation_media')
      .select('id, storage_path')
      .eq('id', input.photoId)
      .eq('observation_id', input.observationId)
      .eq('user_id', input.userId)
      .maybeSingle<{ id: string; storage_path: string }>();
    if (error) throw databaseFailure(error);
    if (!media) return null;

    const { error: storageError } = await client.storage
      .from(BUCKET)
      .remove([media.storage_path]);
    if (storageError) throw storageFailure(storageError);

    const { error: mediaError } = await client
      .from('observation_media')
      .delete()
      .eq('id', input.photoId)
      .eq('user_id', input.userId);
    if (mediaError) throw databaseFailure(mediaError);

    const { count, error: countError } = await client
      .from('observation_media')
      .select('id', { count: 'exact', head: true })
      .eq('observation_id', input.observationId)
      .eq('user_id', input.userId);
    if (countError) throw databaseFailure(countError);
    if ((count ?? 0) > 0) return { observationDeleted: false };

    const { error: observationError } = await client
      .from('observations')
      .delete()
      .eq('id', input.observationId)
      .eq('user_id', input.userId);
    if (observationError) throw databaseFailure(observationError);

    return { observationDeleted: true };
  }

  async deleteObservation(
    accessToken: string,
    input: DeleteObservationInput,
  ): Promise<boolean> {
    const client = this.createClient(accessToken);

    const { data: observation, error } = await client
      .from('observations')
      .select('id, observation_media(storage_path)')
      .eq('id', input.observationId)
      .eq('user_id', input.userId)
      .maybeSingle<{
        id: string;
        observation_media: Array<{ storage_path: string }> | null;
      }>();
    if (error) throw databaseFailure(error);
    if (!observation) return false;

    const paths = (observation.observation_media ?? []).map(
      (media) => media.storage_path,
    );
    if (paths.length > 0) {
      const { error: storageError } = await client.storage
        .from(BUCKET)
        .remove(paths);
      if (storageError) throw storageFailure(storageError);
    }

    const { error: deleteError } = await client
      .from('observations')
      .delete()
      .eq('id', input.observationId)
      .eq('user_id', input.userId);
    if (deleteError) throw databaseFailure(deleteError);

    return true;
  }

  private async signPhotoUrls(
    client: ObservationsClient,
    rows: ObservationHistoryRow[],
  ): Promise<Map<string, string>> {
    const paths = rows.flatMap((row) =>
      (row.observation_media ?? []).map((photo) => photo.storage_path),
    );
    const urls = new Map<string, string>();
    if (paths.length === 0) return urls;

    const { data, error } = await client.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_PHOTO_URL_TTL_SECONDS);
    if (error) throw storageFailure(error);

    for (const photo of data ?? []) {
      if (photo.path && photo.signedUrl) urls.set(photo.path, photo.signedUrl);
    }
    return urls;
  }
}

function toHistoryItem(
  row: ObservationHistoryRow,
  thumbnailUrlByPath: Map<string, string>,
): ObservationHistoryItem {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    celestialObjectName: row.celestial_object_name,
    observedAt: row.observed_at,
    latitude: toCoordinate(row.latitude),
    longitude: toCoordinate(row.longitude),
    photos: (row.observation_media ?? []).map((photo) => ({
      id: photo.id,
      storagePath: photo.storage_path,
      capturedAt: photo.captured_at,
      thumbnailUrl: thumbnailUrlByPath.get(photo.storage_path) ?? null,
      capture: summarizeCaptureMetadata(photo.capture_metadata),
    })),
  };
}

function toCoordinate(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function extensionFor(contentType: ObservationPhotoContentType): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/heic':
      return 'heic';
    case 'image/heif':
      return 'heif';
  }
}

function databaseFailure(error: PostgrestError): ObservationStoreError {
  return new ObservationStoreError({ source: 'database', error });
}

function storageFailure(error: StorageError): ObservationStoreError {
  return new ObservationStoreError({ source: 'storage', error });
}
