import { z } from 'zod';

const automaticNumber = z.union([z.number().finite(), z.literal('automatic')]);

export const observationPhotoMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  notes: z.string().max(4_000).default(''),
  capturedAt: z.iso.datetime({ offset: true }),
  astronomicalEventId: z.uuid().nullable().optional(),
  celestialObjectName: z.string().trim().min(1).max(160).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  device: z.object({
    id: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
  }),
  parameters: z.object({
    focusMode: z.enum(['center-metering', 'automatic', 'manual']),
    exposureMode: z.enum(['manual', 'automatic-metering', 'automatic']),
    exposureCompensationEv: z.number().finite(),
    iso: automaticNumber,
    exposureTimeSeconds: automaticNumber,
    focusLensPosition: z
      .union([z.number().min(0).max(1), z.literal('automatic')])
      .optional(),
    whiteBalanceKelvin: z
      .union([z.number().min(1_000).max(15_000), z.literal('automatic')])
      .optional(),
    fallbacks: z
      .array(
        z.enum([
          'focus-metering',
          'manual-exposure',
          'exposure-compensation',
          'manual-focus',
          'white-balance',
        ]),
      )
      .max(5),
  }),
});

export const observationPhotoParamsSchema = z.object({
  observationId: z.uuid(),
  photoId: z.uuid(),
});

export const observationParamsSchema = z.object({
  observationId: z.uuid(),
});

export const observationHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ObservationPhotoMetadata = z.infer<
  typeof observationPhotoMetadataSchema
>;
export type ObservationHistoryQuery = z.infer<
  typeof observationHistoryQuerySchema
>;
