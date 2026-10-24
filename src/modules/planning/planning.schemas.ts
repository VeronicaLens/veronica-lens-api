import { z } from 'zod';

import { observerSchema } from '../astronomy/index.js';
import { celestialObjectIdSchema } from '../catalog/catalog.schemas.js';

export const MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;

export const recommendationSchema = z
  .strictObject({
    objectId: celestialObjectIdSchema,
    observer: observerSchema,
    windowFrom: z.iso.datetime({ offset: true }),
    windowTo: z.iso.datetime({ offset: true }),
    minimumAltitudeDegrees: z.number().min(0).max(80).default(20),
  })
  .refine((input) => {
    const duration = Date.parse(input.windowTo) - Date.parse(input.windowFrom);

    return duration > 0 && duration <= MAX_WINDOW_MS;
  });

export type RecommendationInput = z.infer<typeof recommendationSchema>;
