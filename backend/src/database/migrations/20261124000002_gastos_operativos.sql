CREATE TABLE gastos_operativos (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  registro_id UUID NOT NULL,
  fecha DATE NOT NULL,
  categoria VARCHAR(12) NOT NULL CHECK (categoria IN ('ALQUILER', 'OTRO')),
  monto NUMERIC(11,2) NOT NULL CHECK (monto > 0),
  concepto VARCHAR(200) NOT NULL CHECK (length(trim(concepto)) > 0),
  UNIQUE (sucursal_id, usuario_id, registro_id)
);

CREATE INDEX gastos_operativos_sucursal_fecha_idx ON gastos_operativos(sucursal_id, fecha);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol')
     AND pg_has_role(current_user, 'pos_app_rol', 'USAGE') THEN
    GRANT SELECT, INSERT ON gastos_operativos TO pos_app_rol;
    GRANT USAGE ON SEQUENCE gastos_operativos_id_seq TO pos_app_rol;
    REVOKE UPDATE ON gastos_operativos FROM pos_app_rol;
  END IF;
END
$$;
