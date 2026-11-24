ALTER TYPE "MetodoPago" ADD VALUE IF NOT EXISTS 'SIN_COBRO';

ALTER TABLE ventas
  ADD COLUMN cortesia_autorizada_por_id INTEGER REFERENCES usuarios(id),
  ADD COLUMN cortesia_motivo VARCHAR(250);

ALTER TABLE venta_detalles
  ADD COLUMN cantidad_cortesia INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN costo_pendiente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN consumo_pendiente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN consumo_receta JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT venta_detalles_cortesia_valida CHECK (cantidad_cortesia BETWEEN 0 AND cantidad);

CREATE INDEX venta_detalles_cortesia_idx ON venta_detalles(venta_id) WHERE cantidad_cortesia > 0;

CREATE TABLE nomina_vigencias (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  desde DATE NOT NULL,
  sueldo_mensual NUMERIC(12,2) CHECK (sueldo_mensual >= 0),
  PRIMARY KEY (usuario_id, desde)
);
ALTER TABLE usuarios ADD COLUMN fecha_baja_nomina DATE;

INSERT INTO nomina_vigencias (usuario_id, desde, sueldo_mensual)
SELECT id, (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guatemala')::date, sueldo_mensual
FROM usuarios
WHERE activo AND fecha_ingreso IS NOT NULL AND sueldo_mensual IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol')
     AND pg_has_role(current_user, 'pos_app_rol', 'USAGE') THEN
    GRANT SELECT, INSERT, UPDATE ON nomina_vigencias TO pos_app_rol;
  END IF;
END
$$;

INSERT INTO roles (codigo, nombre, descripcion, vista_inicial, es_sistema, activo, updated_at)
VALUES ('AUDITOR_SISTEMA', 'Auditor de sistema', 'Bitácora de actividad y seguridad', '/auditoria', false, true, CURRENT_TIMESTAMP)
ON CONFLICT (codigo) DO NOTHING;
UPDATE roles SET nombre = 'Auditor económico' WHERE codigo = 'AUDITOR' AND nombre = 'Auditor';

INSERT INTO permisos (codigo, vista, accion, descripcion) VALUES
  ('auditoria:ver', 'auditoria', 'ver', 'Consultar bitácora inmutable de auditoría'),
  ('auditoria:economica', 'auditoria', 'economica', 'Consultar la bitácora económica'),
  ('auditoria:sistema', 'auditoria', 'sistema', 'Consultar la bitácora del sistema'),
  ('reportes:balance', 'reportes', 'balance', 'Consultar el balance económico'),
  ('ventas:autorizar_cortesia', 'ventas', 'autorizar_cortesia', 'Autorizar cortesías')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE (r.codigo IN ('AUDITOR', 'ADMIN') AND p.codigo IN
          ('auditoria:economica','reportes:balance','ventas:autorizar_cortesia'))
   OR (r.codigo IN ('AUDITOR_SISTEMA','ADMIN') AND p.codigo IN
          ('auditoria:ver','auditoria:sistema','auditoria:exportar'))
   OR (r.codigo = 'CAJERO' AND p.codigo IN ('facturas:ver','facturas:reimprimir'))
ON CONFLICT DO NOTHING;
