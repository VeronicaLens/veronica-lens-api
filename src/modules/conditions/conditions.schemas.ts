import { z } from 'zod';

import { observerSchema } from '../astronomy/index.js';

export const currentConditionsSchema = z.strictObject({
  observer: observerSchema,
  at: z.iso.datetime({ offset: true }).optional(),
});

export const conditionsForecastSchema = z.strictObject({
  observer: observerSchema,
});

export type CurrentConditionsInput = z.infer<typeof currentConditionsSchema>;
export type ConditionsForecastInput = z.infer<typeof conditionsForecastSchema>;
