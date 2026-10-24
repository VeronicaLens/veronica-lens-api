import 'dotenv/config';
import { z } from 'zod';

const corsOriginsSchema = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .pipe(
    z.array(
      z.url().pipe(
        z.string().refine((value) => {
          const url = new URL(value);

          return (
            ['http:', 'https:'].includes(url.protocol) &&
            url.origin === value
          );
        }, 'Use somente origens HTTP(S), sem caminho ou barra final.'),
      ),
    ),
  );

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z
    .string()
    .regex(/^\d+$/, 'Deve conter apenas numeros.')
    .default('3000')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  SUPABASE_URL: z.url().pipe(z.string().refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Deve usar HTTP ou HTTPS.',
  )),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
  SUPABASE_SECRET_KEY: z.string().trim().min(1),
  PASSWORD_RESET_REDIRECT_URL: z.literal(
    'veronicalens://auth/reset-password',
  ),
  CORS_ORIGINS: corsOriginsSchema,
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];

    throw new Error(
      `Configuracao de ambiente invalida. Verifique: ${fields.join(', ')}.`,
    );
  }

  return result.data;
}