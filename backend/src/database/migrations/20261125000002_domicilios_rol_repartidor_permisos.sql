-- ============================================================================
-- Migración: Rol REPARTIDOR y permisos RBAC del módulo de Servicio a Domicilio
-- - Crea el rol REPARTIDOR (vista inicial /domicilios).
-- - Inserta los 8 permisos domicilios:* en el catálogo maestro.
-- - Asigna los permisos por defecto a ADMIN, CAJERO, CHEF, REPARTIDOR y AUDITOR.
-- ============================================================================

INSERT INTO "roles" ("codigo", "nombre", "descripcion", "vista_inicial", "es_sistema", "activo", "updated_at")
VALUES (
  'REPARTIDOR',
  'Repartidor',
  'Consulta sus entregas asignadas a domicilio y actualiza el estado en ruta',
  '/domicilios',
  false,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "permisos" ("codigo", "vista", "accion", "descripcion") VALUES
  ('domicilios:ver', 'domicilios', 'ver', 'Ver tablero y detalle de pedidos a domicilio'),
  ('domicilios:crear', 'domicilios', 'crear', 'Registrar nuevos pedidos a domicilio y clientes'),
  ('domicilios:asignar', 'domicilios', 'asignar', 'Asignar o reasignar repartidor a pedidos a domicilio'),
  ('domicilios:actualizar_estado', 'domicilios', 'actualizar_estado', 'Avanzar estado de pedidos a domicilio según rol'),
  ('domicilios:cancelar', 'domicilios', 'cancelar', 'Cancelar pedidos a domicilio antes de despachar'),
  ('domicilios:liquidar', 'domicilios', 'liquidar', 'Liquidar cobros contra entrega en caja'),
  ('domicilios:configurar', 'domicilios', 'configurar', 'Administrar zonas de entrega, tarifas y pedido mínimo'),
  ('domicilios:ver_propios', 'domicilios', 'ver_propios', 'Ver únicamente los pedidos a domicilio asignados al propio repartidor')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r.id, p.id
FROM "roles" r
CROSS JOIN "permisos" p
WHERE
  (r.codigo = 'ADMIN' AND p.codigo IN (
    'domicilios:ver',
    'domicilios:crear',
    'domicilios:asignar',
    'domicilios:actualizar_estado',
    'domicilios:cancelar',
    'domicilios:liquidar',
    'domicilios:configurar',
    'domicilios:ver_propios'
  ))
  OR (r.codigo = 'CAJERO' AND p.codigo IN (
    'domicilios:ver',
    'domicilios:crear',
    'domicilios:asignar',
    'domicilios:actualizar_estado',
    'domicilios:cancelar',
    'domicilios:liquidar'
  ))
  OR (r.codigo = 'CHEF' AND p.codigo IN (
    'domicilios:ver',
    'domicilios:actualizar_estado'
  ))
  OR (r.codigo = 'REPARTIDOR' AND p.codigo IN (
    'domicilios:ver_propios',
    'domicilios:actualizar_estado'
  ))
  OR (r.codigo = 'AUDITOR' AND p.codigo IN (
    'domicilios:ver'
  ))
ON CONFLICT DO NOTHING;
