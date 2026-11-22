-- Control dual de caja: un cajero no abre ni cierra caja por sí mismo. La apertura y el cierre los
-- autoriza un supervisor (Administrador o Auditor) con su usuario y contraseña, para que el cuadre
-- tenga un responsable distinto de quien maneja el efectivo.

INSERT INTO "permisos" ("codigo", "vista", "accion", "descripcion")
VALUES ('caja:autorizar', 'caja', 'autorizar',
        'Autorizar con usuario y contraseña la apertura y el cierre de caja de otros usuarios')
ON CONFLICT ("codigo") DO NOTHING;

-- Administrador y Auditor (si existe en esta base) pueden autorizar
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r."codigo" IN ('ADMIN', 'AUDITOR') AND p."codigo" = 'caja:autorizar'
ON CONFLICT DO NOTHING;

-- Quién autorizó cada apertura y cierre
ALTER TABLE "caja_sesiones"
  ADD COLUMN IF NOT EXISTS "usuario_autoriza_apertura_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "usuario_autoriza_cierre_id" INTEGER;

ALTER TABLE "caja_sesiones"
  ADD CONSTRAINT "caja_sesiones_usuario_autoriza_apertura_id_fkey"
  FOREIGN KEY ("usuario_autoriza_apertura_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "caja_sesiones"
  ADD CONSTRAINT "caja_sesiones_usuario_autoriza_cierre_id_fkey"
  FOREIGN KEY ("usuario_autoriza_cierre_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
