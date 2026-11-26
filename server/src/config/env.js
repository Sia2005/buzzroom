import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGO_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/buzzroom'),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash-lite'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  USE_REDIS_ADAPTER: booleanFromString,
  ROOM_TTL_SECONDS: z.coerce.number().int().min(60).default(7200),
  REVEAL_MS: z.coerce.number().int().min(0).max(30000).default(4000),
  GENERATE_RATE_LIMIT: z.coerce.number().int().min(1).default(5),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

function loadEnv(source) {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  process.stderr.write(`Invalid environment configuration:\n${problems}\n`);
  process.exit(1);
}

const raw = loadEnv(process.env);

export const env = Object.freeze({
  ...raw,
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  isProduction: raw.NODE_ENV === 'production',
});
