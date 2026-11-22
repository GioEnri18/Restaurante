ALTER TABLE usuarios
  ADD COLUMN fecha_ingreso date,
  ADD COLUMN sueldo_mensual numeric(12, 2),
  ADD CONSTRAINT usuarios_sueldo_mensual_positivo CHECK (sueldo_mensual > 0);
