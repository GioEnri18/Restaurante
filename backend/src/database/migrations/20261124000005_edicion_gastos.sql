ALTER TABLE gastos_operativos
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN anulado_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol')
     AND pg_has_role(current_user, 'pos_app_rol', 'USAGE') THEN
    GRANT UPDATE (fecha, monto, concepto, version, anulado_at) ON gastos_operativos TO pos_app_rol;
  END IF;
END
$$;
