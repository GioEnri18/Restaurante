-- Auditoría P0.2 y P0.3: bloqueo temporal por intentos fallidos y revocación de sesiones JWT.
-- token_version se incrementa en logout, cambio de contraseña, cambio de rol o desactivación;
-- todo JWT emitido con una versión anterior queda invalidado.

ALTER TABLE "usuarios"
  ADD COLUMN IF NOT EXISTS "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bloqueado_hasta" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;

-- Búsqueda exacta e insensible a mayúsculas en el login (sin comodines ILIKE)
CREATE INDEX IF NOT EXISTS "usuarios_lower_username_idx" ON "usuarios" (LOWER("username"));
CREATE INDEX IF NOT EXISTS "usuarios_lower_email_idx" ON "usuarios" (LOWER("email"));
