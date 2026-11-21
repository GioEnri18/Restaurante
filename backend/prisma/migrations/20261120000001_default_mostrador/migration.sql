-- Establecer MOSTRADOR como tipo de servicio por defecto en nuevas ventas
ALTER TABLE "ventas" ALTER COLUMN "tipo_servicio" SET DEFAULT 'MOSTRADOR';
