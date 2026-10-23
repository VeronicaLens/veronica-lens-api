import 'dotenv/config';
import { z } from 'zod';

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
});

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
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