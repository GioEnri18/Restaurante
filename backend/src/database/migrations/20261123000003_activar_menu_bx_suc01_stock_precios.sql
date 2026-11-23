-- Activa los 35 platillos del Menú base BX en la sucursal principal (SUC-01)
-- cargando recetas para combos/bebidas envasadas, existencias iniciales, costos
-- realistas en Quetzales (GTQ) y precios de venta sugeridos.
--
-- Garantías de seguridad e idempotencia:
-- 1. Si SUC-01 aún no existe (ej. base virgen en CI antes de seed), no hace nada.
-- 2. No modifica el trigger `precargar_menu_base_bx` para sucursales nuevas.
-- 3. Respeta precios, recetas y existencias que un administrador ya haya editado.
DO $activar_bx$
DECLARE
  v_sucursal_id integer;
  v_usuario_id integer;
  v_proveedor_id integer;
  v_ahora timestamp := timezone('UTC', now());
  v_platillo record;
  v_ing record;
  v_ingrediente_id integer;
  v_codigo_unit text;
  v_stock_anterior numeric(12,4);
  v_cantidad_entrada numeric(12,4);
  v_stock_nuevo numeric(12,4);
  v_costo_oz numeric(12,4);
  v_stock_minimo numeric(12,4);

  -- Precios sugeridos en Quetzales (GTQ, IVA 12% incluido) para los 35 SKUs BX
  v_precios CONSTANT jsonb := $precios$
  {
    "BX-01": 68.00,
    "BX-02": 48.00,
    "BX-03": 45.00,
    "BX-04": 48.00,
    "BX-05": 46.00,
    "BX-06": 65.00,
    "BX-07": 55.00,
    "BX-08": 50.00,
    "BX-09": 46.00,
    "BX-10": 58.00,
    "BX-11": 58.00,
    "BX-12": 52.00,
    "BX-13": 58.00,
    "BX-14": 62.00,
    "BX-15": 48.00,
    "BX-16": 52.00,
    "BX-17": 54.00,
    "BX-18-N": 38.00,
    "BX-18-P": 40.00,
    "BX-18-C": 44.00,
    "BX-19": 95.00,
    "BX-20": 115.00,
    "BX-21": 195.00,
    "BX-22": 125.00,
    "BX-23": 15.00,
    "BX-24": 15.00,
    "BX-25": 15.00,
    "BX-26": 12.00,
    "BX-27": 12.00,
    "BX-28": 12.00,
    "BX-29": 12.00,
    "BX-30": 12.00,
    "BX-31": 8.00,
    "BX-32": 10.00,
    "BX-33": 10.00
  }
  $precios$::jsonb;

  -- Costo promedio sugerido por onza (GTQ/oz) para ingredientes BX de cocina
  v_costos_por_nombre CONSTANT jsonb := $costos$
  {
    "Camarón limpio": 4.5000,
    "Pechuga de pollo": 1.6000,
    "Alitas de pollo con hueso": 1.4500,
    "Nuggets de pollo": 1.7500,
    "Res molida": 2.1500,
    "Res en tiras": 2.6000,
    "Res para birria": 2.4000,
    "Espaldilla de cerdo": 1.8000,
    "Chorizo argentino": 2.2000,
    "Queso mozzarella": 2.4000,
    "Salsa de queso": 1.5000,
    "Crema": 1.2500,
    "Yogur": 0.9000,
    "Papas para freír": 0.4500,
    "Aceite de fritura imputado": 0.8500,
    "Batter": 0.6500,
    "Panko": 0.9500,
    "Pan de hamburguesa": 0.8500,
    "Pan chapata": 1.1000,
    "Pan de sándwich": 0.6000,
    "Tortilla de maíz": 0.3500,
    "Totopos": 0.7000,
    "Aderezo": 0.9500,
    "Salsa": 0.6500,
    "Salsa barbacoa": 1.1000,
    "Salsa búfalo": 1.1500,
    "Chimichurri": 1.2000,
    "Guacamole": 1.4000,
    "Aguacate": 1.3500,
    "Escabeche": 0.5500,
    "Frijol": 0.5500,
    "Lechuga": 0.4000,
    "Repollo": 0.3000,
    "Tomate": 0.4500,
    "Cebolla blanca": 0.4000,
    "Cebolla caramelizada": 0.7500,
    "Cilantro": 0.5000,
    "Limón": 0.5500,
    "Ajo": 1.1000,
    "Jalapeño": 0.8000,
    "Piña enlatada escurrida": 0.9500,
    "Chile guajillo seco": 2.5000,
    "Chile ancho seco": 2.6000,
    "Mezcla de especias de birria": 2.8000,
    "Sazonador de camarón": 2.2000,
    "Ajo en polvo": 1.9000,
    "Cebolla en polvo": 1.8000,
    "Pimienta": 2.5000,
    "Flor de jamaica seca": 2.0000,
    "Arroz seco": 0.3500,
    "Pulpa de tamarindo": 1.2500,
    "Azúcar": 0.2500,
    "Canela": 2.4000,
    "Vainilla": 2.2000
  }
  $costos$::jsonb;

  -- Costo unitario sugerido (GTQ por unidad/porción) para combos y bebidas envasadas
  v_costos_unitarios CONSTANT jsonb := $costos_u$
  {
    "BX-19": 38.0000,
    "BX-20": 46.0000,
    "BX-21": 78.0000,
    "BX-22": 50.0000,
    "BX-26": 4.5000,
    "BX-27": 4.5000,
    "BX-28": 4.5000,
    "BX-29": 4.8000,
    "BX-30": 4.5000,
    "BX-31": 2.5000,
    "BX-32": 3.5000,
    "BX-33": 3.5000
  }
  $costos_u$::jsonb;
BEGIN
  -- 1. Ubicar la sucursal principal SUC-01 activa
  SELECT id INTO v_sucursal_id
  FROM public.sucursales
  WHERE codigo = 'SUC-01' AND activa = true
  ORDER BY id
  LIMIT 1;

  IF v_sucursal_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Asegurar que los 35 productos del catálogo BX existan en SUC-01
  PERFORM public.precargar_menu_base_bx(v_sucursal_id);

  -- 3. Usuario responsable para registrar las entradas iniciales en Kardex (si existe)
  SELECT u.id INTO v_usuario_id
  FROM public.usuarios u
  INNER JOIN public.roles r ON r.id = u.rol_id
  WHERE u.sucursal_id = v_sucursal_id AND u.activo = true
  ORDER BY CASE WHEN r.codigo = 'ADMIN' THEN 0 ELSE 1 END, u.id ASC
  LIMIT 1;

  -- 4. Proveedor inicial para los insumos BX (idempotente)
  SELECT id INTO v_proveedor_id
  FROM public.proveedores
  WHERE sucursal_id = v_sucursal_id AND nombre = 'Proveedor Inicial Menú BX'
  ORDER BY id
  LIMIT 1;

  IF v_proveedor_id IS NULL THEN
    INSERT INTO public.proveedores (sucursal_id, nombre, nit, telefono, contacto, activo, created_at, updated_at)
    VALUES (
      v_sucursal_id,
      'Proveedor Inicial Menú BX',
      'CF',
      '2200-0000',
      'Abastecimiento Inicial',
      true,
      v_ahora,
      v_ahora
    )
    RETURNING id INTO v_proveedor_id;
  END IF;

  -- 5. Crear ingrediente unitario y receta para los platillos BX sin receta (combos y gaseosas/agua)
  FOR v_platillo IN
    SELECT p.id, p.sku, p.nombre
    FROM public.platillos p
    WHERE p.sucursal_id = v_sucursal_id
      AND p.sku LIKE 'BX-%'
      AND p.activo = true
      AND NOT EXISTS (
        SELECT 1 FROM public.receta_ingredientes ri WHERE ri.platillo_id = p.id
      )
    ORDER BY p.sku
  LOOP
    v_codigo_unit := 'BX-UNIT-' || substring(v_platillo.sku FROM 4);
    v_costo_oz := COALESCE((v_costos_unitarios ->> v_platillo.sku)::numeric, 10.0000);

    INSERT INTO public.ingredientes (
      sucursal_id,
      proveedor_id,
      codigo,
      nombre,
      unidad_base,
      stock_actual_oz,
      stock_minimo_oz,
      costo_promedio_oz,
      activo,
      created_at,
      updated_at
    )
    VALUES (
      v_sucursal_id,
      v_proveedor_id,
      v_codigo_unit,
      left('Presentación ' || v_platillo.nombre, 120),
      'oz',
      0,
      10,
      v_costo_oz,
      true,
      v_ahora,
      v_ahora
    )
    ON CONFLICT (sucursal_id, codigo) DO NOTHING;

    SELECT id INTO STRICT v_ingrediente_id
    FROM public.ingredientes
    WHERE sucursal_id = v_sucursal_id AND codigo = v_codigo_unit;

    INSERT INTO public.receta_ingredientes (platillo_id, ingrediente_id, cantidad_oz)
    VALUES (v_platillo.id, v_ingrediente_id, 1.0000);
  END LOOP;

  -- 6. Cargar stock inicial y costo promedio a los insumos usados en recetas BX sin existencias
  FOR v_ing IN
    SELECT DISTINCT i.id, i.codigo, i.nombre, i.stock_actual_oz, i.stock_minimo_oz, i.costo_promedio_oz, i.proveedor_id
    FROM public.ingredientes i
    INNER JOIN public.receta_ingredientes ri ON ri.ingrediente_id = i.id
    INNER JOIN public.platillos p ON p.id = ri.platillo_id
    WHERE i.sucursal_id = v_sucursal_id
      AND p.sucursal_id = v_sucursal_id
      AND p.sku LIKE 'BX-%'
    ORDER BY i.id
  LOOP
    v_stock_anterior := COALESCE(v_ing.stock_actual_oz, 0);

    IF v_ing.costo_promedio_oz > 0 THEN
      v_costo_oz := v_ing.costo_promedio_oz;
    ELSIF v_ing.codigo LIKE 'BX-UNIT-%' THEN
      v_costo_oz := COALESCE((v_costos_unitarios ->> ('BX-' || substring(v_ing.codigo FROM 9)))::numeric, 10.0000);
    ELSE
      v_costo_oz := COALESCE((v_costos_por_nombre ->> v_ing.nombre)::numeric, 1.2500);
    END IF;

    IF v_ing.codigo LIKE 'BX-UNIT-%' THEN
      v_cantidad_entrada := CASE WHEN v_stock_anterior <= 0 THEN 80.0000 ELSE 0 END;
      v_stock_minimo := CASE WHEN v_ing.stock_minimo_oz > 0 THEN v_ing.stock_minimo_oz ELSE 10.0000 END;
    ELSE
      -- 20 libras = 320 oz para insumos de cocina
      v_cantidad_entrada := CASE WHEN v_stock_anterior <= 0 THEN 320.0000 ELSE 0 END;
      v_stock_minimo := CASE WHEN v_ing.stock_minimo_oz > 0 THEN v_ing.stock_minimo_oz ELSE 32.0000 END;
    END IF;

    v_stock_nuevo := v_stock_anterior + v_cantidad_entrada;

    UPDATE public.ingredientes
    SET
      proveedor_id = COALESCE(proveedor_id, v_proveedor_id),
      stock_actual_oz = v_stock_nuevo,
      stock_minimo_oz = v_stock_minimo,
      costo_promedio_oz = v_costo_oz,
      activo = true,
      updated_at = v_ahora
    WHERE id = v_ing.id;

    IF v_cantidad_entrada > 0 AND v_usuario_id IS NOT NULL THEN
      INSERT INTO public.inventario_movimientos (
        sucursal_id,
        ingrediente_id,
        usuario_id,
        tipo,
        cantidad_oz,
        stock_anterior_oz,
        stock_nuevo_oz,
        costo_unitario_oz,
        referencia_tipo,
        motivo,
        created_at
      )
      VALUES (
        v_sucursal_id,
        v_ing.id,
        v_usuario_id,
        'ENTRADA_COMPRA',
        v_cantidad_entrada,
        v_stock_anterior,
        v_stock_nuevo,
        v_costo_oz,
        'CARGA_INICIAL_BX',
        'Stock inicial automático para habilitar ventas del Menú BX',
        v_ahora
      );
    END IF;
  END LOOP;

  -- 7. Asignar precios sugeridos (sin sobrescribir existentes) y activar los 35 platillos BX
  FOR v_platillo IN
    SELECT id, sku, precio_venta
    FROM public.platillos
    WHERE sucursal_id = v_sucursal_id
      AND sku LIKE 'BX-%'
      AND activo = true
  LOOP
    UPDATE public.platillos
    SET
      precio_venta = COALESCE(precio_venta, (v_precios ->> v_platillo.sku)::numeric, 35.00),
      disponible = true,
      updated_at = v_ahora
    WHERE id = v_platillo.id;
  END LOOP;
END;
$activar_bx$;
