-- Menú inicial de Restaurante Exprés BX. Gramajes por orden, sujetos a validación.
-- El agua (consomé y bebidas naturales) se prepara pero no se descuenta del inventario.
-- Cada copia por sucursal conserva los cambios posteriores de sus administradores.
CREATE FUNCTION public.precargar_menu_base_bx(p_sucursal_id integer)
RETURNS integer
LANGUAGE plpgsql
AS $func$
DECLARE
  v_menu CONSTANT jsonb := $catalogo$
[
  {"categoria": "BX · Empanizados y alitas", "productos": [
    ["01","Camarones empanizados con papas",5,{"Papas para freír":150,"Aceite de fritura imputado":10,"Batter":30,"Panko":25,"Camarón limpio":145,"Aderezo":25,"Salsa":20,"Sazonador de camarón":2},"Sazonador de prueba con sal, pimienta, ajo, cebolla, glutamato y colorante naranja, según formulación del proveedor."],
    ["02","Deditos de pollo con papas",6,{"Papas para freír":150,"Aceite de fritura imputado":10,"Batter":30,"Panko":25,"Pechuga de pollo":150,"Aderezo":25,"Salsa":20,"Ajo en polvo":1,"Cebolla en polvo":1,"Pimienta":0.5}],
    ["10","Alitas a la barbacoa con papas",14,{"Papas para freír":150,"Aceite de fritura imputado":10,"Alitas de pollo con hueso":280,"Salsa barbacoa":45,"Aderezo":25},"Porción estimada de seis piezas, validar por peso."],
    ["11","Alitas búfalo con papas",15,{"Papas para freír":150,"Aceite de fritura imputado":10,"Alitas de pollo con hueso":280,"Salsa búfalo":45},"Porción estimada de seis piezas, validar por peso."],
    ["17","Pollo crunch con papas",21,{"Papas para freír":150,"Aceite de fritura imputado":10,"Batter":30,"Panko":25,"Pechuga de pollo":180,"Aderezo":25}]
  ]},
  {"categoria": "BX · Hamburguesas y panes", "productos": [
    ["03","Hamburguesa tradicional con papas",7,{"Papas para freír":150,"Aceite de fritura imputado":10,"Pan de hamburguesa":75,"Aderezo":20,"Lechuga":15,"Tomate":30,"Cebolla caramelizada":20,"Res molida":150,"Queso mozzarella":25}],
    ["04","Hamburguesa hawaiana con papas",8,{"Papas para freír":150,"Aceite de fritura imputado":10,"Pan de hamburguesa":75,"Aderezo":20,"Lechuga":15,"Tomate":30,"Cebolla caramelizada":20,"Res molida":150,"Queso mozzarella":25,"Piña enlatada escurrida":45}],
    ["05","Hamburguesa de pollo con papas",9,{"Papas para freír":150,"Aceite de fritura imputado":10,"Pan de hamburguesa":75,"Aderezo":20,"Lechuga":15,"Tomate":30,"Cebolla caramelizada":20,"Batter":30,"Panko":25,"Pechuga de pollo":145}],
    ["06","Cangre búrguer con papas",10,{"Papas para freír":150,"Aceite de fritura imputado":10,"Pan de hamburguesa":75,"Aderezo":20,"Lechuga":15,"Tomate":30,"Cebolla caramelizada":20,"Res molida":120,"Camarón limpio":70,"Batter":15,"Panko":12}],
    ["07","Pan con carne Viuda con papas",11,{"Papas para freír":150,"Aceite de fritura imputado":10,"Pan chapata":100,"Res en tiras":150,"Chimichurri":25,"Lechuga":15,"Cebolla caramelizada":25,"Tomate":35}],
    ["08","Pan con chorizo argentino con papas",12,{"Papas para freír":150,"Aceite de fritura imputado":10,"Pan chapata":90,"Chorizo argentino":125,"Guacamole":30,"Escabeche":25,"Aguacate":25,"Chimichurri":18},"Se eligió escabeche como una de las alternativas del documento."],
    ["09","Sándwich con cerdo",13,{"Pan de sándwich":80,"Espaldilla de cerdo":165,"Guacamole":35},"Se estimó con espaldilla. La pierna es la alternativa del documento."]
  ]},
  {"categoria": "BX · Tacos y para compartir", "productos": [
    ["12","Tacos de birria",16,{"Tortilla de maíz":75,"Cebolla blanca":35,"Cilantro":4,"Limón":20,"Salsa":20,"Res para birria":170,"Chile guajillo seco":5,"Chile ancho seco":2,"Tomate":25,"Ajo":3,"Mezcla de especias de birria":2},"Tres tacos con consomé. Los gramajes de birria incluyen su proporción de consomé; el agua del consomé no se descuenta del inventario."],
    ["13","Quesabirrias",17,{"Tortilla de maíz":75,"Cebolla blanca":35,"Cilantro":4,"Limón":20,"Salsa":20,"Res para birria":170,"Chile guajillo seco":5,"Chile ancho seco":2,"Tomate":25,"Ajo":3,"Mezcla de especias de birria":2,"Queso mozzarella":65},"Tres quesabirrias con consomé; el agua del consomé no se descuenta del inventario."],
    ["14","Tacos de camarón",18,{"Tortilla de maíz":75,"Cebolla blanca":15,"Cilantro":4,"Limón":20,"Salsa":20,"Camarón limpio":145,"Batter":24,"Panko":20,"Repollo":35,"Aderezo":25,"Aceite de fritura imputado":8},"Tres tacos. Se estimó con camarón empanizado."],
    ["15","Papas con carne",19,{"Papas para freír":220,"Aceite de fritura imputado":10,"Res molida":130,"Salsa de queso":45,"Salsa":25}],
    ["16","Nachos con carne",20,{"Totopos":110,"Res molida":130,"Salsa de queso":55,"Frijol":50,"Salsa":30,"Jalapeño":12,"Crema":25}]
  ]},
  {"categoria": "BX · Cajitas y combos", "productos": [
    ["18-N","Cajita infantil de nuggets",22,{"Papas para freír":90,"Aceite de fritura imputado":6,"Yogur":80,"Nuggets de pollo":90},"Agregar 1 bebida y 1 juguete según presentación."],
    ["18-P","Cajita infantil de deditos",22,{"Papas para freír":90,"Aceite de fritura imputado":6,"Yogur":80,"Pechuga de pollo":90,"Batter":18,"Panko":15},"Agregar 1 bebida y 1 juguete según presentación."],
    ["18-C","Cajita infantil de camarones",22,{"Papas para freír":90,"Aceite de fritura imputado":6,"Yogur":80,"Camarón limpio":85,"Batter":18,"Panko":15},"Agregar 1 bebida y 1 juguete según presentación."],
    ["19","Combo cuates",23,{},"Pendiente definir combinación y tamaño."],
    ["20","Combo de amor",24,{},"Pendiente definir combinación y tamaño."],
    ["21","Combo familiar",26,{},"Pendiente definir combinación y tamaño."],
    ["22","Combo para picar",27,{},"Pendiente definir combinación y tamaño."]
  ]},
  {"categoria": "BX · Bebidas naturales", "productos": [
    ["23","Jamaica",28,{"Flor de jamaica seca":6,"Azúcar":25},"Vaso de 355 ml con unos 325 ml de agua (no se descuenta del inventario). Ajustar agua y hielo al medir el rendimiento final."],
    ["24","Horchata",28,{"Arroz seco":28,"Azúcar":28,"Canela":1,"Vainilla":1},"Vaso de 355 ml con unos 300 ml de agua (no se descuenta del inventario). Validar el rendimiento después de colar."],
    ["25","Tamarindo",28,{"Pulpa de tamarindo":34,"Azúcar":25},"Vaso de 355 ml con unos 305 ml de agua (no se descuenta del inventario). Validar el rendimiento después de colar."]
  ]},
  {"categoria": "BX · Gaseosas y agua", "productos": [
    ["26","Grapette lata",29,{},"1 lata. Confirmar presentación para configurar inventario."],
    ["27","Seven lata",29,{},"1 lata. Confirmar presentación para configurar inventario."],
    ["28","Mirinda lata",29,{},"1 lata. Confirmar presentación para configurar inventario."],
    ["29","Coca-Cola lata",29,{},"1 lata. Confirmar presentación para configurar inventario."],
    ["30","Pepsi lata",29,{},"1 lata. Confirmar presentación para configurar inventario."],
    ["31","Agua pura PET 500 ml",29,{},"1 botella de 500 ml."],
    ["32","Grapette PET 355 ml",29,{},"1 botella de 355 ml."],
    ["33","Pepsi PET 355 ml",29,{},"1 botella de 355 ml."]
  ]}
]
$catalogo$::jsonb;
  v_categoria record;
  v_producto jsonb;
  v_insumo record;
  v_categoria_id integer;
  v_platillo_id integer;
  v_ingrediente_id integer;
  v_codigo text;
  v_creados integer := 0;
  v_ahora timestamp := timezone('UTC', now());
BEGIN
  PERFORM 1 FROM public.sucursales WHERE id = p_sucursal_id AND activa FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR v_categoria IN SELECT value AS datos, ordinality FROM jsonb_array_elements(v_menu) WITH ORDINALITY
  LOOP
    SELECT id INTO v_categoria_id FROM public.categorias
      WHERE sucursal_id = p_sucursal_id AND nombre = v_categoria.datos->>'categoria'
      ORDER BY id LIMIT 1;
    IF v_categoria_id IS NULL THEN
      INSERT INTO public.categorias (sucursal_id, nombre, orden, updated_at)
        VALUES (p_sucursal_id, v_categoria.datos->>'categoria', 99 + v_categoria.ordinality, v_ahora)
        RETURNING id INTO v_categoria_id;
    END IF;

    FOR v_producto IN SELECT value FROM jsonb_array_elements(v_categoria.datos->'productos')
    LOOP
      INSERT INTO public.platillos
        (sucursal_id, categoria_id, sku, nombre, descripcion, precio_venta, imagen_url, disponible, updated_at)
      VALUES
        (p_sucursal_id, v_categoria_id, 'BX-' || (v_producto->>0), v_producto->>1, v_producto->>4,
         NULL, '/media/platillos/00000000-0000-4000-8b00-' || lpad(v_producto->>2, 12, '0') || '.webp',
         false, v_ahora)
      ON CONFLICT (sucursal_id, sku) DO NOTHING
      RETURNING id INTO v_platillo_id;

      IF v_platillo_id IS NULL THEN
        CONTINUE;
      END IF;

      v_creados := v_creados + 1;
      FOR v_insumo IN SELECT key AS nombre, value::numeric AS gramos FROM jsonb_each_text(v_producto->3)
      LOOP
        v_codigo := 'BX-ING-' || left(encode(sha256(convert_to(v_insumo.nombre, 'UTF8')), 'hex'), 16);
        INSERT INTO public.ingredientes (sucursal_id, codigo, nombre, stock_minimo_oz, updated_at)
          VALUES (p_sucursal_id, v_codigo, v_insumo.nombre, 0, v_ahora)
          ON CONFLICT (sucursal_id, codigo) DO NOTHING;

        SELECT id INTO STRICT v_ingrediente_id FROM public.ingredientes
          WHERE sucursal_id = p_sucursal_id AND codigo = v_codigo;
        INSERT INTO public.receta_ingredientes (platillo_id, ingrediente_id, cantidad_oz)
          VALUES (v_platillo_id, v_ingrediente_id, round(v_insumo.gramos / 28.349523125, 4));
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN v_creados;
END;
$func$;

CREATE FUNCTION public.precargar_menu_bx_sucursal_nueva()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  PERFORM public.precargar_menu_base_bx(NEW.id);
  RETURN NEW;
END;
$func$;

CREATE TRIGGER precargar_menu_bx_sucursal_nueva
AFTER INSERT ON public.sucursales
FOR EACH ROW WHEN (NEW.activa)
EXECUTE FUNCTION public.precargar_menu_bx_sucursal_nueva();

-- Carga inicial para las sucursales existentes antes de instalar el trigger.
DO $backfill$
BEGIN
  PERFORM public.precargar_menu_base_bx(id) FROM public.sucursales WHERE activa ORDER BY id;
END;
$backfill$;
