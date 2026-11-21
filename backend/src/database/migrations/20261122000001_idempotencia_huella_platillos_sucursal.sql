-- Idempotencia: huella SHA-256 del pedido asociado a la clave.
-- Reutilizar una idempotency_key con un pedido distinto se rechaza (409) en lugar de devolver otra venta.
ALTER TABLE "ventas"
  ADD COLUMN IF NOT EXISTS "idempotency_huella" VARCHAR(64);

-- Aislamiento por sucursal: cada platillo pertenece a una sucursal.
ALTER TABLE "platillos"
  ADD COLUMN IF NOT EXISTS "sucursal_id" INTEGER;

-- Backfill deducido de los propios datos, para no ocultar platillos a la sucursal que los usa.
-- Evidencia de la sucursal de un platillo:
--   1. la sucursal de su categoría (si la categoría no es global),
--   2. la sucursal de los ingredientes de su receta,
--   3. la sucursal de las ventas donde aparece,
--   4. la sucursal de los menús especiales que lo incluyen.
-- Si un platillo tiene evidencia de VARIAS sucursales, la migración se detiene (rollback) y lista
-- los casos: hay que decidir a mano (por ejemplo, duplicar el platillo por sucursal).
-- Un platillo sin ninguna evidencia solo se asigna automáticamente si existe una única sucursal.
DO $$
DECLARE
  ambiguos TEXT;
  sin_evidencia TEXT;
  total_sucursales INT := (SELECT COUNT(*) FROM sucursales);
BEGIN
  CREATE TEMP TABLE evidencia_platillo ON COMMIT DROP AS
  SELECT p.id AS platillo_id, e.sucursal_id
  FROM platillos p
  CROSS JOIN LATERAL (
    SELECT c.sucursal_id FROM categorias c
    WHERE c.id = p.categoria_id AND c.sucursal_id IS NOT NULL
    UNION
    SELECT i.sucursal_id FROM receta_ingredientes r
    JOIN ingredientes i ON i.id = r.ingrediente_id
    WHERE r.platillo_id = p.id
    UNION
    SELECT v.sucursal_id FROM venta_detalles d
    JOIN ventas v ON v.id = d.venta_id
    WHERE d.platillo_id = p.id
    UNION
    SELECT me.sucursal_id FROM menu_especial_platillos mp
    JOIN menus_especiales me ON me.id = mp.menu_especial_id
    WHERE mp.platillo_id = p.id
  ) e
  WHERE p.sucursal_id IS NULL;

  SELECT string_agg(format('platillo %s (%s) usado en sucursales %s', p.id, p.nombre, x.sucursales), '; ')
  INTO ambiguos
  FROM (
    SELECT platillo_id, string_agg(sucursal_id::text, ', ' ORDER BY sucursal_id) AS sucursales
    FROM evidencia_platillo
    GROUP BY platillo_id
    HAVING COUNT(DISTINCT sucursal_id) > 1
  ) x
  JOIN platillos p ON p.id = x.platillo_id;

  IF ambiguos IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede asignar sucursal automáticamente. %', ambiguos
      USING HINT = 'Duplica esos platillos por sucursal o asígnales una categoría de sucursal y vuelve a migrar. No se modificó nada.';
  END IF;

  UPDATE platillos p
  SET sucursal_id = e.sucursal_id
  FROM evidencia_platillo e
  WHERE e.platillo_id = p.id AND p.sucursal_id IS NULL;

  IF total_sucursales = 1 THEN
    UPDATE platillos SET sucursal_id = (SELECT id FROM sucursales) WHERE sucursal_id IS NULL;
  END IF;

  SELECT string_agg(format('platillo %s (%s)', id, nombre), '; ')
  INTO sin_evidencia
  FROM platillos WHERE sucursal_id IS NULL;

  IF sin_evidencia IS NOT NULL THEN
    RAISE EXCEPTION 'Platillos sin categoría de sucursal, receta, ventas ni menús especiales: %', sin_evidencia
      USING HINT = 'Asígnales una categoría de sucursal (o una receta) y vuelve a migrar. No se modificó nada.';
  END IF;
END
$$;

ALTER TABLE "platillos"
  ALTER COLUMN "sucursal_id" SET NOT NULL;

ALTER TABLE "platillos"
  ADD CONSTRAINT "platillos_sucursal_id_fkey"
  FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El SKU pasa a ser único por sucursal (antes global)
DROP INDEX IF EXISTS "platillos_sku_key";
CREATE UNIQUE INDEX "platillos_sucursal_id_sku_key" ON "platillos"("sucursal_id", "sku");
CREATE INDEX "platillos_sucursal_id_activo_idx" ON "platillos"("sucursal_id", "activo", "disponible");
