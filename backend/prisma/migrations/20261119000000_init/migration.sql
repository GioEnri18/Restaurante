-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('DISPONIBLE', 'OCUPADA', 'RESERVADA');

-- CreateEnum
CREATE TYPE "TipoServicio" AS ENUM ('MESA', 'LLEVAR', 'DELIVERY');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA');

-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('COMPLETADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('EMITIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoFel" AS ENUM ('NO_APLICA', 'PENDIENTE', 'CERTIFICADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoComanda" AS ENUM ('PENDIENTE', 'EN_PREPARACION', 'LISTA', 'ENTREGADA');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('INGRESO_VENTA', 'INGRESO_MANUAL', 'EGRESO_MANUAL', 'EGRESO_ANULACION');

-- CreateEnum
CREATE TYPE "TipoMovimientoInventario" AS ENUM ('ENTRADA_COMPRA', 'SALIDA_VENTA', 'SALIDA_MERMA', 'AJUSTE_MANUAL', 'REVERSION_ANULACION');

-- CreateEnum
CREATE TYPE "MotivoMerma" AS ENUM ('VENCIMIENTO', 'DANO', 'ERROR_PREPARACION', 'ACCIDENTE', 'OTRO');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('lb', 'oz');

-- CreateTable
CREATE TABLE "sucursales" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "nit" VARCHAR(25) NOT NULL,
    "direccion" VARCHAR(250) NOT NULL,
    "telefono" VARCHAR(30),
    "serie_factura" VARCHAR(10) NOT NULL DEFAULT 'A',
    "correlativo_actual" INTEGER NOT NULL DEFAULT 0,
    "correlativo_comanda" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(250),
    "vista_inicial" VARCHAR(60) NOT NULL DEFAULT '/ventas',
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(80) NOT NULL,
    "vista" VARCHAR(40) NOT NULL,
    "accion" VARCHAR(40) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "rol_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "nombre_completo" VARCHAR(120) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acceso" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_permisos" (
    "usuario_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuario_permisos_pkey" PRIMARY KEY ("usuario_id","permiso_id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER,
    "nombre" VARCHAR(80) NOT NULL,
    "descripcion" VARCHAR(200),
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platillos" (
    "id" SERIAL NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "sku" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300),
    "precio_venta" DECIMAL(10,2) NOT NULL,
    "imagen_url" VARCHAR(300),
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platillos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta_ingredientes" (
    "id" SERIAL NOT NULL,
    "platillo_id" INTEGER NOT NULL,
    "ingrediente_id" INTEGER NOT NULL,
    "cantidad_oz" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "receta_ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 4,
    "estado" "EstadoMesa" NOT NULL DEFAULT 'DISPONIBLE',
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "nit" VARCHAR(25),
    "telefono" VARCHAR(30),
    "email" VARCHAR(120),
    "contacto" VARCHAR(100),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredientes" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "unidad_base" "UnidadMedida" NOT NULL DEFAULT 'oz',
    "stock_actual_oz" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "stock_minimo_oz" DECIMAL(12,4) NOT NULL DEFAULT 16,
    "costo_promedio_oz" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compras" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "proveedor_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "numero_documento" VARCHAR(60),
    "total" DECIMAL(12,2) NOT NULL,
    "observaciones" VARCHAR(300),
    "fecha_compra" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra_detalles" (
    "id" SERIAL NOT NULL,
    "compra_id" INTEGER NOT NULL,
    "ingrediente_id" INTEGER NOT NULL,
    "cantidad_lb" DECIMAL(10,4) NOT NULL,
    "cantidad_oz" DECIMAL(12,4) NOT NULL,
    "precio_por_lb" DECIMAL(10,2) NOT NULL,
    "costo_por_oz" DECIMAL(12,4) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "compra_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_movimientos" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "ingrediente_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" "TipoMovimientoInventario" NOT NULL,
    "cantidad_oz" DECIMAL(12,4) NOT NULL,
    "stock_anterior_oz" DECIMAL(12,4) NOT NULL,
    "stock_nuevo_oz" DECIMAL(12,4) NOT NULL,
    "costo_unitario_oz" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "referencia_tipo" VARCHAR(40),
    "referencia_id" INTEGER,
    "motivo" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventario_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mermas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "ingrediente_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cantidad_original" DECIMAL(10,4) NOT NULL,
    "unidad_original" "UnidadMedida" NOT NULL,
    "cantidad_oz" DECIMAL(12,4) NOT NULL,
    "costo_estimado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "motivo" "MotivoMerma" NOT NULL,
    "observacion" VARCHAR(300),
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mermas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_sesiones" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "usuario_apertura_id" INTEGER NOT NULL,
    "usuario_cierre_id" INTEGER,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'ABIERTA',
    "monto_inicial" DECIMAL(12,2) NOT NULL,
    "total_ventas_efectivo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_ventas_tarjeta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_ingresos_extra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_egresos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monto_esperado_efectivo" DECIMAL(12,2),
    "monto_contado_efectivo" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "observaciones_cierre" VARCHAR(300),
    "fecha_apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(3),

    CONSTRAINT "caja_sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja_movimientos" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "caja_sesion_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "venta_id" INTEGER,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO',
    "monto" DECIMAL(12,2) NOT NULL,
    "descripcion" VARCHAR(250) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "caja_sesion_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "mesa_id" INTEGER,
    "tipo_servicio" "TipoServicio" NOT NULL DEFAULT 'MESA',
    "estado" "EstadoVenta" NOT NULL DEFAULT 'COMPLETADA',
    "subtotal_sin_iva" DECIMAL(12,2) NOT NULL,
    "iva_monto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "costo_total_receta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metodo_pago" "MetodoPago" NOT NULL,
    "monto_recibido" DECIMAL(12,2) NOT NULL,
    "cambio" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "referencia_pago" VARCHAR(80),
    "observaciones" VARCHAR(300),
    "reserva_id" INTEGER,
    "datos_delivery_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta_detalles" (
    "id" SERIAL NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "platillo_id" INTEGER NOT NULL,
    "nombre_platillo" VARCHAR(120) NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "costo_unitario_receta" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "notas" VARCHAR(250),

    CONSTRAINT "venta_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "serie" VARCHAR(10) NOT NULL,
    "numero" INTEGER NOT NULL,
    "numero_completo" VARCHAR(30) NOT NULL,
    "cliente_nit" VARCHAR(25) NOT NULL DEFAULT 'CF',
    "cliente_nombre" VARCHAR(150) NOT NULL DEFAULT 'Consumidor Final',
    "cliente_direccion" VARCHAR(250) DEFAULT 'Ciudad',
    "subtotal_sin_iva" DECIMAL(12,2) NOT NULL,
    "iva_monto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'EMITIDA',
    "motivo_anulacion" VARCHAR(300),
    "anulada_por_id" INTEGER,
    "anulada_en" TIMESTAMP(3),
    "reimpresiones_count" INTEGER NOT NULL DEFAULT 0,
    "fel_estado" "EstadoFel" NOT NULL DEFAULT 'NO_APLICA',
    "fel_uuid" VARCHAR(80),
    "fel_serie" VARCHAR(30),
    "fel_numero" VARCHAR(40),
    "fel_certificado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comandas" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "venta_id" INTEGER NOT NULL,
    "numero_comanda" VARCHAR(30) NOT NULL,
    "tipo_servicio" "TipoServicio" NOT NULL,
    "mesa_numero" VARCHAR(20),
    "estado_cocina" "EstadoComanda" NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comandas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_logs" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER,
    "usuario_id" INTEGER,
    "accion" VARCHAR(60) NOT NULL,
    "entidad" VARCHAR(60) NOT NULL,
    "entidad_id" VARCHAR(60),
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "motivo" VARCHAR(300),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_codigo_key" ON "sucursales"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "permisos"("codigo");

-- CreateIndex
CREATE INDEX "permisos_vista_idx" ON "permisos"("vista");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_username_key" ON "usuarios"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_sucursal_id_activo_idx" ON "usuarios"("sucursal_id", "activo");

-- CreateIndex
CREATE INDEX "usuarios_rol_id_idx" ON "usuarios"("rol_id");

-- CreateIndex
CREATE INDEX "categorias_sucursal_id_activa_orden_idx" ON "categorias"("sucursal_id", "activa", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "platillos_sku_key" ON "platillos"("sku");

-- CreateIndex
CREATE INDEX "platillos_categoria_id_activo_disponible_idx" ON "platillos"("categoria_id", "activo", "disponible");

-- CreateIndex
CREATE INDEX "receta_ingredientes_ingrediente_id_idx" ON "receta_ingredientes"("ingrediente_id");

-- CreateIndex
CREATE UNIQUE INDEX "receta_ingredientes_platillo_id_ingrediente_id_key" ON "receta_ingredientes"("platillo_id", "ingrediente_id");

-- CreateIndex
CREATE INDEX "mesas_sucursal_id_estado_idx" ON "mesas"("sucursal_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "mesas_sucursal_id_numero_key" ON "mesas"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "proveedores_sucursal_id_activo_idx" ON "proveedores"("sucursal_id", "activo");

-- CreateIndex
CREATE INDEX "ingredientes_sucursal_id_activo_idx" ON "ingredientes"("sucursal_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "ingredientes_sucursal_id_codigo_key" ON "ingredientes"("sucursal_id", "codigo");

-- CreateIndex
CREATE INDEX "compras_sucursal_id_fecha_compra_idx" ON "compras"("sucursal_id", "fecha_compra" DESC);

-- CreateIndex
CREATE INDEX "compra_detalles_compra_id_idx" ON "compra_detalles"("compra_id");

-- CreateIndex
CREATE INDEX "compra_detalles_ingrediente_id_idx" ON "compra_detalles"("ingrediente_id");

-- CreateIndex
CREATE INDEX "inventario_movimientos_sucursal_id_ingrediente_id_created_a_idx" ON "inventario_movimientos"("sucursal_id", "ingrediente_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inventario_movimientos_sucursal_id_tipo_created_at_idx" ON "inventario_movimientos"("sucursal_id", "tipo", "created_at" DESC);

-- CreateIndex
CREATE INDEX "mermas_sucursal_id_fecha_idx" ON "mermas"("sucursal_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "mermas_sucursal_id_motivo_idx" ON "mermas"("sucursal_id", "motivo");

-- CreateIndex
CREATE INDEX "caja_sesiones_sucursal_id_estado_idx" ON "caja_sesiones"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "caja_sesiones_sucursal_id_fecha_apertura_idx" ON "caja_sesiones"("sucursal_id", "fecha_apertura" DESC);

-- CreateIndex
CREATE INDEX "caja_movimientos_caja_sesion_id_created_at_idx" ON "caja_movimientos"("caja_sesion_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "caja_movimientos_sucursal_id_created_at_idx" ON "caja_movimientos"("sucursal_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ventas_sucursal_id_created_at_idx" ON "ventas"("sucursal_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ventas_caja_sesion_id_idx" ON "ventas"("caja_sesion_id");

-- CreateIndex
CREATE INDEX "ventas_estado_created_at_idx" ON "ventas"("estado", "created_at" DESC);

-- CreateIndex
CREATE INDEX "venta_detalles_venta_id_idx" ON "venta_detalles"("venta_id");

-- CreateIndex
CREATE INDEX "venta_detalles_platillo_id_idx" ON "venta_detalles"("platillo_id");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_venta_id_key" ON "facturas"("venta_id");

-- CreateIndex
CREATE INDEX "facturas_sucursal_id_created_at_idx" ON "facturas"("sucursal_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "facturas_numero_completo_idx" ON "facturas"("numero_completo");

-- CreateIndex
CREATE INDEX "facturas_cliente_nombre_idx" ON "facturas"("cliente_nombre");

-- CreateIndex
CREATE INDEX "facturas_total_idx" ON "facturas"("total");

-- CreateIndex
CREATE INDEX "facturas_estado_idx" ON "facturas"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "facturas_sucursal_id_serie_numero_key" ON "facturas"("sucursal_id", "serie", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "comandas_venta_id_key" ON "comandas"("venta_id");

-- CreateIndex
CREATE INDEX "comandas_sucursal_id_created_at_idx" ON "comandas"("sucursal_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auditoria_logs_created_at_idx" ON "auditoria_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "auditoria_logs_usuario_id_created_at_idx" ON "auditoria_logs"("usuario_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auditoria_logs_accion_created_at_idx" ON "auditoria_logs"("accion", "created_at" DESC);

-- CreateIndex
CREATE INDEX "auditoria_logs_sucursal_id_created_at_idx" ON "auditoria_logs"("sucursal_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permisos" ADD CONSTRAINT "usuario_permisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permisos" ADD CONSTRAINT "usuario_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platillos" ADD CONSTRAINT "platillos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_ingredientes" ADD CONSTRAINT "receta_ingredientes_platillo_id_fkey" FOREIGN KEY ("platillo_id") REFERENCES "platillos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta_ingredientes" ADD CONSTRAINT "receta_ingredientes_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredientes" ADD CONSTRAINT "ingredientes_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredientes" ADD CONSTRAINT "ingredientes_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_detalles" ADD CONSTRAINT "compra_detalles_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_detalles" ADD CONSTRAINT "compra_detalles_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_movimientos" ADD CONSTRAINT "inventario_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_ingrediente_id_fkey" FOREIGN KEY ("ingrediente_id") REFERENCES "ingredientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesiones" ADD CONSTRAINT "caja_sesiones_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesiones" ADD CONSTRAINT "caja_sesiones_usuario_apertura_id_fkey" FOREIGN KEY ("usuario_apertura_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_sesiones" ADD CONSTRAINT "caja_sesiones_usuario_cierre_id_fkey" FOREIGN KEY ("usuario_cierre_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja_movimientos" ADD CONSTRAINT "caja_movimientos_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_caja_sesion_id_fkey" FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_detalles" ADD CONSTRAINT "venta_detalles_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_detalles" ADD CONSTRAINT "venta_detalles_platillo_id_fkey" FOREIGN KEY ("platillo_id") REFERENCES "platillos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_anulada_por_id_fkey" FOREIGN KEY ("anulada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_logs" ADD CONSTRAINT "auditoria_logs_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_logs" ADD CONSTRAINT "auditoria_logs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

