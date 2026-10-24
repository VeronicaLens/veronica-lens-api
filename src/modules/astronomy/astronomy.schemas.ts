import { z } from 'zod';

export const observerSchema = z.strictObject({
  latitudeDegrees: z.number().min(-90).max(90),
  longitudeDegrees: z.number().min(-180).max(180),
  elevationMeters: z.number().min(-500).max(9_000).default(0),
});
