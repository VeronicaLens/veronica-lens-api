import { z } from 'zod';

export const MAX_EVENTS_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

export const listEventsSchema = z
  .strictObject({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    type: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80)
      .optional(),
    limit: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .default(50),
  });

export type ListEventsQuery = z.infer<typeof listEventsSchema>;

export const eventIdSchema = z.uuid();
