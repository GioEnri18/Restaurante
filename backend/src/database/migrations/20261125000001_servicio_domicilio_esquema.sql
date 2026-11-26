-- ============================================================================
-- Migración: Esquema integral del módulo de Servicio a Domicilio (Fase 1)
-- - Crea enums EstadoPedidoDomicilio y ModalidadPagoDomicilio.
-- - Amplía TipoMovimientoCaja para conciliación de diferencias de repartidor.
-- - Crea zonas_entrega, clientes, direcciones_entrega, pedidos_domicilio,
--   pedido_domicilio_detalles y pedido_domicilio_historial (append-only).
-- - Agrega columnas nullable/seguras en sucursales, ventas, facturas, comandas y mermas.
-- - Crea índices únicos, parciales y de tablero/polling/repartidor.
-- - Aplica privilegios de mínimo privilegio a pos_app_rol (sin DELETE).
-- ============================================================================

-- 1. Enums de dominio
CREATE TYPE "EstadoPedidoDomicilio" AS ENUM (
  'NUEVO',
  'EN_PREPARACION',
  'LISTO',
  'EN_RUTA',
  'ENTREGADO',
  'CANCELADO',
  'FALLIDO'
);

CREATE TYPE "ModalidadPagoDomicilio" AS ENUM (
  'PREPAGADO',
  'CONTRA_ENTREGA'
);

-- Movimientos de caja para trazar diferencias de efectivo en liquidación de repartidor
ALTER TYPE "TipoMovimientoCaja" ADD VALUE IF NOT EXISTS 'INGRESO_DIFERENCIA_REPARTIDOR';
ALTER TYPE "TipoMovimientoCaja" ADD VALUE IF NOT EXISTS 'EGRESO_DIFERENCIA_REPARTIDOR';

-- 2. Zonas de entrega (tarifa de envío con IVA 12% incluido, tiempo estimado y pedido mínimo)
CREATE TABLE "zonas_entrega" (
  "id" SERIAL NOT NULL,
  "sucursal_id" INTEGER NOT NULL,
  "nombre" VARCHAR(100) NOT NULL,
  "descripcion" VARCHAR(250),
  "costo_envio" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tiempo_estimado_min" INTEGER NOT NULL DEFAULT 30,
  "pedido_minimo" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "zonas_entrega_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zonas_entrega_sucursal_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "zonas_entrega_costo_envio_chk" CHECK ("costo_envio" >= 0),
  CONSTRAINT "zonas_entrega_tiempo_chk" CHECK ("tiempo_estimado_min" BETWEEN 1 AND 480),
  CONSTRAINT "zonas_entrega_pedido_minimo_chk" CHECK ("pedido_minimo" >= 0)
);

CREATE UNIQUE INDEX "uq_zonas_entrega_sucursal_nombre"
  ON "zonas_entrega" ("sucursal_id", LOWER(TRIM("nombre")));
CREATE INDEX "idx_zonas_entrega_sucursal_activa"
  ON "zonas_entrega" ("sucursal_id", "activa");

-- 3. Clientes de domicilio (unicidad por sucursal + teléfono normalizado)
CREATE TABLE "clientes" (
  "id" SERIAL NOT NULL,
  "sucursal_id" INTEGER NOT NULL,
  "nombre" VARCHAR(150) NOT NULL,
  "telefono" VARCHAR(25) NOT NULL,
  "nit" VARCHAR(25),
  "notas" VARCHAR(250),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clientes_sucursal_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_clientes_sucursal_telefono"
  ON "clientes" ("sucursal_id", "telefono");
CREATE INDEX "idx_clientes_sucursal_activo"
  ON "clientes" ("sucursal_id", "activo");

-- 4. Direcciones de entrega asociadas a cada cliente
CREATE TABLE "direcciones_entrega" (
  "id" SERIAL NOT NULL,
  "sucursal_id" INTEGER NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "zona_entrega_id" INTEGER,
  "alias" VARCHAR(60) NOT NULL DEFAULT 'Principal',
  "direccion" VARCHAR(250) NOT NULL,
  "referencia" VARCHAR(250),
  "es_principal" BOOLEAN NOT NULL DEFAULT false,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "direcciones_entrega_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "direcciones_entrega_sucursal_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "direcciones_entrega_cliente_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "direcciones_entrega_zona_fkey" FOREIGN KEY ("zona_entrega_id") REFERENCES "zonas_entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_direcciones_entrega_cliente_activa"
  ON "direcciones_entrega" ("cliente_id", "activa");
CREATE INDEX "idx_direcciones_entrega_sucursal_zona"
  ON "direcciones_entrega" ("sucursal_id", "zona_entrega_id");

-- 5. Pedidos a domicilio (snapshots inmutables de tarifa/cliente/dirección + idempotencia + estados)
CREATE TABLE "pedidos_domicilio" (
  "id" SERIAL NOT NULL,
  "sucursal_id" INTEGER NOT NULL,
  "numero_pedido" VARCHAR(30) NOT NULL,
  "cliente_id" INTEGER NOT NULL,
  "direccion_entrega_id" INTEGER NOT NULL,
  "zona_entrega_id" INTEGER NOT NULL,
  "creado_por_id" INTEGER NOT NULL,
  "repartidor_id" INTEGER,
  "venta_id" INTEGER,
  "estado" "EstadoPedidoDomicilio" NOT NULL DEFAULT 'NUEVO',
  "modalidad_pago" "ModalidadPagoDomicilio" NOT NULL,
  "metodo_pago_esperado" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
  "subtotal_platillos" DECIMAL(12,2) NOT NULL,
  "costo_envio" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "zona_nombre_snapshot" VARCHAR(100) NOT NULL,
  "tiempo_estimado_min" INTEGER NOT NULL,
  "direccion_snapshot" VARCHAR(250) NOT NULL,
  "referencia_snapshot" VARCHAR(250),
  "cliente_nombre_snapshot" VARCHAR(150) NOT NULL,
  "cliente_telefono_snapshot" VARCHAR(25) NOT NULL,
  "cliente_nit_snapshot" VARCHAR(25) NOT NULL DEFAULT 'CF',
  "observaciones" VARCHAR(300),
  "monto_con_que_paga" DECIMAL(12,2),
  "monto_recibido_repartidor" DECIMAL(12,2),
  "diferencia_liquidacion" DECIMAL(12,2),
  "referencia_pago_liquidacion" VARCHAR(80),
  "liquidado_por_id" INTEGER,
  "liquidado_en" TIMESTAMP(3),
  "motivo_cierre" VARCHAR(300),
  "merma_generada" BOOLEAN NOT NULL DEFAULT false,
  "factura_anulada_cierre" BOOLEAN NOT NULL DEFAULT false,
  "asignado_en" TIMESTAMP(3),
  "despachado_en" TIMESTAMP(3),
  "entregado_en" TIMESTAMP(3),
  "cancelado_en" TIMESTAMP(3),
  "fallido_en" TIMESTAMP(3),
  "idempotency_key" VARCHAR(64) NOT NULL,
  "idempotency_huella" VARCHAR(64) NOT NULL,
  "liquidacion_idempotency_key" VARCHAR(64),
  "liquidacion_idempotency_huella" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pedidos_domicilio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedidos_domicilio_sucursal_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_cliente_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_direccion_fkey" FOREIGN KEY ("direccion_entrega_id") REFERENCES "direcciones_entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_zona_fkey" FOREIGN KEY ("zona_entrega_id") REFERENCES "zonas_entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_creado_por_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_repartidor_fkey" FOREIGN KEY ("repartidor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_liquidado_por_fkey" FOREIGN KEY ("liquidado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_venta_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedidos_domicilio_subtotal_chk" CHECK ("subtotal_platillos" >= 0),
  CONSTRAINT "pedidos_domicilio_costo_envio_chk" CHECK ("costo_envio" >= 0),
  CONSTRAINT "pedidos_domicilio_total_chk" CHECK ("total" >= 0),
  CONSTRAINT "pedidos_domicilio_monto_recibido_chk" CHECK ("monto_recibido_repartidor" IS NULL OR "monto_recibido_repartidor" >= 0)
);

-- Índices de unicidad, idempotencia y tablero operativo
CREATE UNIQUE INDEX "uq_pedidos_domicilio_sucursal_numero"
  ON "pedidos_domicilio" ("sucursal_id", "numero_pedido");
CREATE UNIQUE INDEX "uq_pedidos_domicilio_venta"
  ON "pedidos_domicilio" ("venta_id")
  WHERE "venta_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_pedidos_domicilio_sucursal_idem"
  ON "pedidos_domicilio" ("sucursal_id", "idempotency_key");
CREATE UNIQUE INDEX "uq_pedidos_domicilio_sucursal_liq_idem"
  ON "pedidos_domicilio" ("sucursal_id", "liquidacion_idempotency_key")
  WHERE "liquidacion_idempotency_key" IS NOT NULL;

-- Tablero por sucursal + estado + fecha
CREATE INDEX "idx_pedidos_domicilio_tablero"
  ON "pedidos_domicilio" ("sucursal_id", "estado", "created_at" DESC);
-- Índice parcial para pedidos activos en cocina/despacho/ruta
CREATE INDEX "idx_pedidos_domicilio_activos"
  ON "pedidos_domicilio" ("sucursal_id", "updated_at" DESC, "created_at" DESC)
  WHERE "estado" IN ('NUEVO', 'EN_PREPARACION', 'LISTO', 'EN_RUTA');
-- Índice parcial para entregas contra entrega pendientes de liquidar en caja
CREATE INDEX "idx_pedidos_domicilio_pendientes_liquidar"
  ON "pedidos_domicilio" ("sucursal_id", "entregado_en" DESC)
  WHERE "modalidad_pago" = 'CONTRA_ENTREGA' AND "estado" = 'ENTREGADO' AND "venta_id" IS NULL;
-- Índice para vista del repartidor (mis entregas)
CREATE INDEX "idx_pedidos_domicilio_repartidor_estado"
  ON "pedidos_domicilio" ("repartidor_id", "estado", "updated_at" DESC)
  WHERE "repartidor_id" IS NOT NULL;
-- Índice para polling incremental con parámetro `desde`
CREATE INDEX "idx_pedidos_domicilio_sucursal_updated"
  ON "pedidos_domicilio" ("sucursal_id", "updated_at" DESC);
-- Índice para reportes por zona y período
CREATE INDEX "idx_pedidos_domicilio_sucursal_zona_fecha"
  ON "pedidos_domicilio" ("sucursal_id", "zona_entrega_id", "created_at" DESC);

-- 6. Detalle de ítems del pedido a domicilio
CREATE TABLE "pedido_domicilio_detalles" (
  "id" SERIAL NOT NULL,
  "pedido_domicilio_id" INTEGER NOT NULL,
  "platillo_id" INTEGER NOT NULL,
  "nombre_platillo" VARCHAR(120) NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "cantidad_cortesia" INTEGER NOT NULL DEFAULT 0,
  "precio_unitario" DECIMAL(10,2) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "notas" VARCHAR(250),

  CONSTRAINT "pedido_domicilio_detalles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedido_domicilio_detalles_pedido_fkey" FOREIGN KEY ("pedido_domicilio_id") REFERENCES "pedidos_domicilio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedido_domicilio_detalles_platillo_fkey" FOREIGN KEY ("platillo_id") REFERENCES "platillos"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedido_domicilio_detalles_cantidad_chk" CHECK ("cantidad" > 0),
  CONSTRAINT "pedido_domicilio_detalles_cortesia_chk" CHECK ("cantidad_cortesia" BETWEEN 0 AND "cantidad"),
  CONSTRAINT "pedido_domicilio_detalles_precio_chk" CHECK ("precio_unitario" >= 0),
  CONSTRAINT "pedido_domicilio_detalles_subtotal_chk" CHECK ("subtotal" >= 0)
);

CREATE INDEX "idx_pedido_domicilio_detalles_pedido"
  ON "pedido_domicilio_detalles" ("pedido_domicilio_id");

-- 7. Historial inmutable (append-only) de transiciones de estado por pedido
CREATE TABLE "pedido_domicilio_historial" (
  "id" SERIAL NOT NULL,
  "pedido_domicilio_id" INTEGER NOT NULL,
  "sucursal_id" INTEGER NOT NULL,
  "estado_anterior" "EstadoPedidoDomicilio",
  "estado_nuevo" "EstadoPedidoDomicilio" NOT NULL,
  "usuario_id" INTEGER NOT NULL,
  "observacion" VARCHAR(300),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pedido_domicilio_historial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pedido_domicilio_historial_pedido_fkey" FOREIGN KEY ("pedido_domicilio_id") REFERENCES "pedidos_domicilio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedido_domicilio_historial_sucursal_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pedido_domicilio_historial_usuario_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "idx_pedido_domicilio_historial_pedido"
  ON "pedido_domicilio_historial" ("pedido_domicilio_id", "created_at" ASC);

-- 8. Columnas nuevas nullable/seguras en tablas existentes (sin tocar auditoria_logs)
ALTER TABLE "sucursales"
  ADD COLUMN IF NOT EXISTS "correlativo_domicilio" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ventas"
  ADD COLUMN IF NOT EXISTS "pedido_domicilio_id" INTEGER REFERENCES "pedidos_domicilio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "costo_envio" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "ventas"
  ADD CONSTRAINT "ventas_costo_envio_chk" CHECK ("costo_envio" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_ventas_pedido_domicilio"
  ON "ventas" ("pedido_domicilio_id")
  WHERE "pedido_domicilio_id" IS NOT NULL;

ALTER TABLE "facturas"
  ADD COLUMN IF NOT EXISTS "costo_envio" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "zona_entrega_nombre" VARCHAR(100);

ALTER TABLE "facturas"
  ADD CONSTRAINT "facturas_costo_envio_chk" CHECK ("costo_envio" >= 0);

-- Comandas: permite venta_id NULL para pedidos CONTRA_ENTREGA que entran a cocina antes de liquidar
ALTER TABLE "comandas"
  ALTER COLUMN "venta_id" DROP NOT NULL;

ALTER TABLE "comandas"
  ADD COLUMN IF NOT EXISTS "pedido_domicilio_id" INTEGER REFERENCES "pedidos_domicilio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS "costo_envio" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "direccion_entrega" VARCHAR(250),
  ADD COLUMN IF NOT EXISTS "referencia_entrega" VARCHAR(250),
  ADD COLUMN IF NOT EXISTS "zona_entrega_nombre" VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_comandas_pedido_domicilio"
  ON "comandas" ("pedido_domicilio_id")
  WHERE "pedido_domicilio_id" IS NOT NULL;

-- Mermas: enlace opcional al pedido a domicilio que originó la merma automática
ALTER TABLE "mermas"
  ADD COLUMN IF NOT EXISTS "pedido_domicilio_id" INTEGER REFERENCES "pedidos_domicilio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_mermas_pedido_domicilio"
  ON "mermas" ("pedido_domicilio_id")
  WHERE "pedido_domicilio_id" IS NOT NULL;

-- 9. Privilegios de mínimo privilegio para pos_app_rol (sin DELETE; historial solo SELECT/INSERT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol')
     AND pg_has_role(current_user, 'pos_app_rol', 'USAGE') THEN
    GRANT SELECT, INSERT, UPDATE ON
      "zonas_entrega",
      "clientes",
      "direcciones_entrega",
      "pedidos_domicilio",
      "pedido_domicilio_detalles"
    TO pos_app_rol;

    REVOKE DELETE ON
      "zonas_entrega",
      "clientes",
      "direcciones_entrega",
      "pedidos_domicilio",
      "pedido_domicilio_detalles"
    FROM pos_app_rol;

    -- Historial de estados es append-only (no se modifica ni se elimina)
    GRANT SELECT, INSERT ON "pedido_domicilio_historial" TO pos_app_rol;
    REVOKE UPDATE, DELETE ON "pedido_domicilio_historial" FROM pos_app_rol;

    GRANT USAGE, SELECT ON SEQUENCE
      "zonas_entrega_id_seq",
      "clientes_id_seq",
      "direcciones_entrega_id_seq",
      "pedidos_domicilio_id_seq",
      "pedido_domicilio_detalles_id_seq",
      "pedido_domicilio_historial_id_seq"
    TO pos_app_rol;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Privilegios insuficientes para ajustar grants de pos_app_rol (entorno gestionado).';
END
$$;
