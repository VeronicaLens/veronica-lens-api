import { z } from 'zod';

export const trackSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);

export const learningIdSchema = z.uuid();

// Completion is fixed by status: not_started is 0 and completed is 100.
// The optional value is accepted only when it matches that fixed value.
export const updateProgressSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('not_started'),
    progressPercent: z.literal(0).optional(),
  }),
  z.strictObject({
    status: z.literal('in_progress'),
    progressPercent: z.number().int().min(1).max(99),
  }),
  z.strictObject({
    status: z.literal('completed'),
    progressPercent: z.literal(100).optional(),
  }),
]);

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
