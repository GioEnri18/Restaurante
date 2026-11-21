-- Búsquedas "contiene" (ILIKE '%texto%'): un índice B-tree no sirve con comodín inicial y
-- PostgreSQL recorría la tabla completa. Los índices GIN con pg_trgm sí aceleran ese patrón.
-- pg_trgm es una extensión "trusted": la puede crear el dueño de la base sin superusuario.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Historial de facturas: número, cliente y NIT
CREATE INDEX IF NOT EXISTS "facturas_numero_completo_trgm_idx"
  ON "facturas" USING gin ("numero_completo" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "facturas_cliente_nombre_trgm_idx"
  ON "facturas" USING gin ("cliente_nombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "facturas_cliente_nit_trgm_idx"
  ON "facturas" USING gin ("cliente_nit" gin_trgm_ops);

-- Inventario: nombre y código de ingrediente
CREATE INDEX IF NOT EXISTS "ingredientes_nombre_trgm_idx"
  ON "ingredientes" USING gin ("nombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ingredientes_codigo_trgm_idx"
  ON "ingredientes" USING gin ("codigo" gin_trgm_ops);

-- Menú: nombre y SKU de platillo
CREATE INDEX IF NOT EXISTS "platillos_nombre_trgm_idx"
  ON "platillos" USING gin ("nombre" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "platillos_sku_trgm_idx"
  ON "platillos" USING gin ("sku" gin_trgm_ops);

-- Reemplazados por los índices trigram (el B-tree de numero_completo/cliente_nombre no servía a ILIKE)
DROP INDEX IF EXISTS "facturas_numero_completo_idx";
DROP INDEX IF EXISTS "facturas_cliente_nombre_idx";
