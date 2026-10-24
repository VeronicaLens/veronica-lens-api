import { z } from 'zod';

import { celestialObjectIdSchema } from '../catalog/catalog.schemas.js';

export const skyPositionsSchema = z.strictObject({
  objectIds: z
    .array(celestialObjectIdSchema)
    .min(1)
    .max(20)
    .transform((ids) => [...new Set(ids)]),
  observedAt: z.iso.datetime({ offset: true }).optional(),
  observer: z.strictObject({
    latitudeDegrees: z.number().min(-90).max(90),
    longitudeDegrees: z.number().min(-180).max(180),
    elevationMeters: z.number().min(-500).max(9_000).default(0),
  }),
});

export type SkyPositionsInput = z.infer<typeof skyPositionsSchema>;
