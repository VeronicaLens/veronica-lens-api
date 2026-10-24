import { z } from 'zod';

// The confirmation phrase prevents accidental deletion. It does not protect
// against a leaked access token; add reauthentication when available.
export const deleteAccountSchema = z.strictObject({
  confirmation: z.literal('DELETE'),
});
