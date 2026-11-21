-- Fase 2.4: Garantía de inmutabilidad real (APPEND-ONLY) en PostgreSQL para auditoria_logs
-- Impide cualquier operación UPDATE o DELETE directamente a nivel de motor de base de datos.

CREATE OR REPLACE FUNCTION fn_bloquear_modificacion_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla auditoria_logs es estrictamente inmutable (append-only): operación % no permitida', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auditoria_logs_inmutable ON auditoria_logs;

CREATE TRIGGER trg_auditoria_logs_inmutable
BEFORE UPDATE OR DELETE ON auditoria_logs
FOR EACH ROW
EXECUTE FUNCTION fn_bloquear_modificacion_auditoria();
