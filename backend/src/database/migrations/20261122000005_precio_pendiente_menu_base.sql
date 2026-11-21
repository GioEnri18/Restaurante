ALTER TABLE platillos ALTER COLUMN precio_venta DROP NOT NULL;

ALTER TABLE platillos
  ADD CONSTRAINT platillos_precio_pendiente_no_disponible
  CHECK (precio_venta IS NOT NULL OR NOT disponible);
