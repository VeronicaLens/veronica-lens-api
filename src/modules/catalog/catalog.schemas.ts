import { z } from 'zod';

import { CELESTIAL_OBJECT_TYPES } from './catalog.types.js';

export const searchCatalogSchema = z.strictObject({
  q: z.string().trim().min(1).max(80).optional(),
  type: z.enum(CELESTIAL_OBJECT_TYPES).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(50))
    .default(20),
});

export type SearchCatalogQuery = z.infer<typeof searchCatalogSchema>;

export const celestialObjectIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);
