import { z } from 'zod';

import { observerSchema } from '../astronomy/index.js';
import { celestialObjectIdSchema } from '../catalog/catalog.schemas.js';

export const skyPositionsSchema = z.strictObject({
  objectIds: z
    .array(celestialObjectIdSchema)
    .min(1)
    .max(20)
    .transform((ids) => [...new Set(ids)]),
  observedAt: z.iso.datetime({ offset: true }).optional(),
  observer: observerSchema,
});

export type SkyPositionsInput = z.infer<typeof skyPositionsSchema>;
