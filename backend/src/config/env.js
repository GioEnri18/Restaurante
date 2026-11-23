const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Interpreta TRUST_PROXY soportando 'false', 'true', número de saltos (ej. '1') o subred (ej. 'loopback')
function parseTrustProxy(raw) {
  const val = String(raw ?? 'false').trim().toLowerCase();
  if (val === 'false' || val === '0' || val === '') return false;
  if (val === 'true') return true;
  if (/^\d+$/.test(val)) return Number(val);
  return String(raw).trim();
}

// Validación centralizada de TODAS las variables de entorno del backend
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.string().default('false').transform(parseTrustProxy),
  JSON_BODY_LIMIT: z.string().default('2mb'),
  PLATILLOS_MEDIA_DIR: z.string().min(1).optional(),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DATABASE_URL_TEST: z.string().optional(),
  // Conexión del DUEÑO del esquema, solo para migraciones. La API usa DATABASE_URL
  // (idealmente un usuario miembro de pos_app_rol, sin privilegios de esquema).
  DATABASE_MIGRATION_URL: z.string().optional(),
  DATABASE_MIGRATION_URL_TEST: z.string().optional(),
  // Aplicar migraciones pendientes al arrancar la API (con advisory lock entre instancias)
  MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_POOL_MIN: z.coerce.number().int().min(0).max(50).default(1),
  DB_POOL_ACQUIRE_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  DB_POOL_IDLE_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  DB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(3000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  // Control de SSL/TLS para PostgreSQL gestionado en la nube (Render, Neon, Supabase, RDS)
  DB_SSL: z.enum(['auto', 'true', 'false']).default('auto'),
  DB_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),

  // Fase 2.1: Rate limiting dedicado exclusivamente a POST /auth/login
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // Límite global por IP en /auth/login (frena password spraying rotando identificadores)
  AUTH_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(30),
  // Bloqueo temporal de cuenta tras N contraseñas incorrectas consecutivas
  AUTH_LOCKOUT_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(50).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(64).default(10),
  // TTL de la caché de permisos efectivos en authenticate (0 = desactivada)
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PERMISOS_CACHE_TTL_MS: z.coerce.number().int().min(0).max(300000).default(30000),
  ADMIN_ROLE_CODE: z.string().min(2).default('ADMIN'),

  // Fase 2.7: Sesión mediante cookie httpOnly + protección CSRF
  AUTH_COOKIE_NAME: z.string().min(3).default('pos_session'),
  AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  AUTH_COOKIE_MAX_AGE_MS: z.coerce.number().int().positive().default(43200000),
  CSRF_PROTECTION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Fase 2.5: Control de seed en producción
  ALLOW_SEED_IN_PRODUCTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

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
  // Límites por venta: líneas del carrito y unidades por línea
  VENTA_MAX_LINEAS: z.coerce.number().int().min(1).max(500).default(50),
  VENTA_MAX_CANTIDAD_POR_LINEA: z.coerce.number().int().min(1).max(10000).default(100),
  DELIVERY_JSON_MAX_KEYS: z.coerce.number().int().min(1).max(100).default(20),
  DELIVERY_JSON_MAX_DEPTH: z.coerce.number().int().min(1).max(10).default(2),
  DELIVERY_JSON_MAX_BYTES: z.coerce.number().int().min(128).max(16384).default(2048),

  // Umbrales y límites del módulo de Auditoría de investigación
  AUDIT_IMPACTO_ALTO_Q: z.coerce.number().positive().max(1000000).default(500),
  AUDIT_DIFERENCIA_CAJA_ALTA_Q: z.coerce.number().positive().max(1000000).default(50),
  AUDIT_REPETICION_UMBRAL: z.coerce.number().int().min(2).max(100).default(3),
  AUDIT_EXPORT_MAX_ROWS: z.coerce.number().int().min(100).max(100000).default(10000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error en variables de entorno:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

// Protección de datos reales: en NODE_ENV=test NUNCA se usa DATABASE_URL como respaldo.
// Las pruebas crean y modifican registros; sin una base de pruebas explícita y distinta, no arranca.
if (env.NODE_ENV === 'test') {
  if (!env.DATABASE_URL_TEST) {
    console.error('❌ NODE_ENV=test requiere DATABASE_URL_TEST (las pruebas nunca usan DATABASE_URL).');
    process.exit(1);
  }
  if (env.DATABASE_URL_TEST === env.DATABASE_URL) {
    console.error('❌ DATABASE_URL_TEST no puede ser la misma base que DATABASE_URL.');
    process.exit(1);
  }
}

// Fase 2.5: Validación estricta de JWT_SECRET en producción (mínimo 32 caracteres y sin texto de ejemplo)
if (env.NODE_ENV === 'production') {
  const esEjemploOInseguro =
    env.JWT_SECRET.length < 32 ||
    /cambia|changeme|example|ejemplo|dev-secret|desarrollo|super-segura|default/i.test(
      env.JWT_SECRET,
    );

  if (esEjemploOInseguro) {
    console.error(
      '❌ SEGURIDAD CRÍTICA: En NODE_ENV=production, JWT_SECRET debe tener al menos 32 caracteres aleatorios y no puede usar un valor de ejemplo.',
    );
    process.exit(1);
  }
}

module.exports = { env };
