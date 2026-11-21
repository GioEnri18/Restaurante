-- Agregar tipo de servicio MOSTRADOR
ALTER TYPE "TipoServicio" ADD VALUE IF NOT EXISTS 'MOSTRADOR';

-- Agregar identificador de cliente/turno para entrega en mostrador en Comandas
ALTER TABLE "comandas" ADD COLUMN IF NOT EXISTS "nombre_turno" VARCHAR(80);

-- Tabla de Menús Especiales por Fecha (administración y avisos previos)
CREATE TABLE "menus_especiales" (
    "id" SERIAL NOT NULL,
    "sucursal_id" INTEGER NOT NULL,
    "creado_por_id" INTEGER,
    "nombre" VARCHAR(120) NOT NULL,
    "descripcion" VARCHAR(300),
    "fecha_inicio" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3) NOT NULL,
    "dias_aviso_previo" INTEGER NOT NULL DEFAULT 5,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "es_menu_principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_especiales_pkey" PRIMARY KEY ("id")
);

-- Relación Menú Especial <-> Platillos (con precio especial opcional)
CREATE TABLE "menu_especial_platillos" (
    "id" SERIAL NOT NULL,
    "menu_especial_id" INTEGER NOT NULL,
    "platillo_id" INTEGER NOT NULL,
    "precio_especial" DECIMAL(10,2),

    CONSTRAINT "menu_especial_platillos_pkey" PRIMARY KEY ("id")
);

-- Índices
CREATE INDEX "menus_especiales_sucursal_id_activo_fecha_inicio_fecha_fin_idx"
    ON "menus_especiales"("sucursal_id", "activo", "fecha_inicio", "fecha_fin");

CREATE INDEX "menu_especial_platillos_platillo_id_idx"
    ON "menu_especial_platillos"("platillo_id");

CREATE UNIQUE INDEX "menu_especial_platillos_menu_especial_id_platillo_id_key"
    ON "menu_especial_platillos"("menu_especial_id", "platillo_id");

-- Llaves foráneas
ALTER TABLE "menus_especiales"
    ADD CONSTRAINT "menus_especiales_sucursal_id_fkey"
    FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "menus_especiales"
    ADD CONSTRAINT "menus_especiales_creado_por_id_fkey"
    FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "menu_especial_platillos"
    ADD CONSTRAINT "menu_especial_platillos_menu_especial_id_fkey"
    FOREIGN KEY ("menu_especial_id") REFERENCES "menus_especiales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_especial_platillos"
    ADD CONSTRAINT "menu_especial_platillos_platillo_id_fkey"
    FOREIGN KEY ("platillo_id") REFERENCES "platillos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
