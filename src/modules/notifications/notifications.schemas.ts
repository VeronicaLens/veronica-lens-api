import { z } from 'zod';

// Expo issues tokens shaped like ExponentPushToken[...] (or ExpoPushToken[...]).
export const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(
    /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/,
    'Token de push Expo invalido.',
  );

export const registerDeviceSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(['android', 'ios']),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
