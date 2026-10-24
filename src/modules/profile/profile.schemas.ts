import { z } from 'zod';

const nullableText = (maximum: number) =>
  z.union([z.string().trim().min(1).max(maximum), z.null()]);

const coordinate = (limit: number) =>
  z.union([z.number().min(-limit).max(limit), z.null()]);

export const updateProfileSchema = z
  .strictObject({
    displayName: nullableText(100).optional(),
    locationName: nullableText(120).optional(),
    latitude: coordinate(90).optional(),
    longitude: coordinate(180).optional(),
    notificationsEnabled: z.boolean().optional(),
    measurementUnit: z.enum(['metric', 'imperial']).optional(),
    language: z.enum(['pt-BR', 'en']).optional(),
  })
  .refine((input) => Object.keys(input).length > 0)
  // Mirrors the database constraint: both coordinates are set or both are null.
  .refine(
    ({ latitude, longitude }) =>
      (latitude === undefined && longitude === undefined) ||
      (latitude !== undefined &&
        longitude !== undefined &&
        (latitude === null) === (longitude === null)),
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
