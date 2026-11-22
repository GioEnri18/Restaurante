WITH nuevo AS (
  INSERT INTO roles (codigo, nombre, descripcion, vista_inicial, es_sistema, activo, updated_at)
  VALUES ('CHEF', 'Chef', 'Consulta existencias y registra pérdidas de cocina', '/inventario', false, true, CURRENT_TIMESTAMP)
  ON CONFLICT (codigo) DO NOTHING
  RETURNING id
)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT nuevo.id, permisos.id
FROM nuevo CROSS JOIN permisos
WHERE permisos.codigo IN ('inventario:ver', 'mermas:ver', 'mermas:crear')
ON CONFLICT DO NOTHING;
