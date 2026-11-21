import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Esquema de validación de TODAS las variables de entorno del backend
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JSON_BODY_LIMIT: z.string().default('2mb'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  ADMIN_ROLE_CODE: z.string().min(2).default('ADMIN'),

  IVA_RATE: z.coerce.number().min(0).max(1).default(0.12),
  CURRENCY_CODE: z.string().default('GTQ'),
  CURRENCY_SYMBOL: z.string().default('Q'),
  DEFAULT_TIMEZONE: z.string().default('America/Guatemala'),
  UNIT_OZ_PER_LB: z.coerce.number().positive().default(16),
  FACTURAS_PAGE_SIZE: z.coerce.number().int().positive().default(10),
  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(20),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(100),

  ENABLE_TABLE_SERVICE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DEFAULT_SERVICE_TYPE: z.enum(['MOSTRADOR', 'LLEVAR', 'MESA', 'DELIVERY']).default('MOSTRADOR'),
  SPECIAL_MENU_DEFAULT_NOTICE_DAYS: z.coerce.number().int().min(1).max(60).default(5),

  FEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  FEL_PROVIDER: z.string().default('NONE'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en variables de entorno:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
