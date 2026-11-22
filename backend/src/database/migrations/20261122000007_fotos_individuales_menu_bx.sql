-- Menú BX: una foto propia por platillo.
-- En 20261122000006, 11 platillos compartían foto: las 3 cajitas infantiles (foto 22), las 3 bebidas
-- naturales (foto 28) y las 8 gaseosas/agua (foto 29). Las fotos nuevas (30 a 42) son recortes de las
-- imágenes del documento del restaurante, con el mismo formato WebP (máx. 480 px y 10 KB).
-- La cajita de deditos conserva la foto 22.
--
-- Solo se cambia la foto si el platillo todavía tiene la foto compartida original: si un administrador
-- ya subió otra, se respeta.

CREATE FUNCTION public.aplicar_fotos_individuales_bx(p_sucursal_id integer)
RETURNS integer
LANGUAGE plpgsql
AS $func$
DECLARE
  v_base CONSTANT text := '/media/platillos/00000000-0000-4000-8b00-';
  v_actualizados integer;
BEGIN
  UPDATE public.platillos p
  SET imagen_url = v_base || lpad(f.nueva::text, 12, '0') || '.webp',
      updated_at = timezone('UTC', now())
  FROM (VALUES
    ('BX-18-N', 22, 30), ('BX-18-C', 22, 31),
    ('BX-23', 28, 32), ('BX-24', 28, 33), ('BX-25', 28, 34),
    ('BX-26', 29, 35), ('BX-27', 29, 36), ('BX-28', 29, 37), ('BX-29', 29, 38),
    ('BX-30', 29, 39), ('BX-31', 29, 40), ('BX-32', 29, 41), ('BX-33', 29, 42)
  ) AS f(sku, compartida, nueva)
  WHERE p.sucursal_id = p_sucursal_id
    AND p.sku = f.sku
    AND p.imagen_url = v_base || lpad(f.compartida::text, 12, '0') || '.webp';
  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  RETURN v_actualizados;
END;
$func$;

-- La carga del catálogo (0006) pasa a llamarse precargar_menu_base_bx_catalogo y
-- precargar_menu_base_bx la envuelve: carga el catálogo y luego aplica las fotos individuales.
-- Así el trigger de sucursales nuevas y el script cargar-menu-base.js, que llaman a
-- precargar_menu_base_bx, obtienen las fotos nuevas sin cambiar.
ALTER FUNCTION public.precargar_menu_base_bx(integer) RENAME TO precargar_menu_base_bx_catalogo;

CREATE FUNCTION public.precargar_menu_base_bx(p_sucursal_id integer)
RETURNS integer
LANGUAGE plpgsql
AS $func$
DECLARE
  v_creados integer;
BEGIN
  v_creados := public.precargar_menu_base_bx_catalogo(p_sucursal_id);
  PERFORM public.aplicar_fotos_individuales_bx(p_sucursal_id);
  RETURN v_creados;
END;
$func$;

-- Sucursales existentes (en producción ya cargaron el menú con la 0006)
DO $backfill$
BEGIN
  PERFORM public.aplicar_fotos_individuales_bx(id) FROM public.sucursales ORDER BY id;
END;
$backfill$;
