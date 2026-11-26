const { env } = require('./env');
// Constantes del negocio alimentadas desde variables de entorno (backend/.env)
const OZ_PER_LB = env.UNIT_OZ_PER_LB;
const FACTURAS_PAGE_SIZE = env.FACTURAS_PAGE_SIZE;
const DEFAULT_PAGE_SIZE = env.DEFAULT_PAGE_SIZE;
const MAX_PAGE_SIZE = env.MAX_PAGE_SIZE;
const ROL_ADMIN_CODIGO = env.ADMIN_ROLE_CODE;
// Algoritmo JWT fijado explícitamente al firmar y verificar (evita confusión de algoritmos)
const JWT_ALGORITHM = 'HS256';
// Catálogo maestro de acciones de auditoría inmutable (activas en el sistema)
const ACCIONES_AUDITORIA = {
    LOGIN_EXITOSO: 'LOGIN_EXITOSO',
    LOGIN_FALLIDO: 'LOGIN_FALLIDO',
    BLOQUEO_CUENTA: 'BLOQUEO_CUENTA',
    LOGOUT: 'LOGOUT',
    VENTA_CONFIRMADA: 'VENTA_CONFIRMADA',
    ANULACION_FACTURA: 'ANULACION_FACTURA',
    REIMPRESION_FACTURA: 'REIMPRESION_FACTURA',
    REIMPRESION_COMANDA: 'REIMPRESION_COMANDA',
    CAMBIO_PRECIO: 'CAMBIO_PRECIO',
    CAMBIO_RECETA: 'CAMBIO_RECETA',
    CAMBIO_DISPONIBILIDAD_PLATILLO: 'CAMBIO_DISPONIBILIDAD_PLATILLO',
    CAMBIO_FOTO_PLATILLO: 'CAMBIO_FOTO_PLATILLO',
    COMPRA_INVENTARIO: 'COMPRA_INVENTARIO',
    AJUSTE_INVENTARIO: 'AJUSTE_INVENTARIO',
    STOCK_NEGATIVO_GENERADO: 'STOCK_NEGATIVO_GENERADO',
    REGISTRO_MERMA: 'REGISTRO_MERMA',
    APERTURA_CAJA: 'APERTURA_CAJA',
    MOVIMIENTO_CAJA: 'MOVIMIENTO_CAJA',
    REGISTRO_GASTO_OPERATIVO: 'REGISTRO_GASTO_OPERATIVO',
    EDICION_GASTO_OPERATIVO: 'EDICION_GASTO_OPERATIVO',
    ANULACION_GASTO_OPERATIVO: 'ANULACION_GASTO_OPERATIVO',
    CIERRE_CAJA: 'CIERRE_CAJA',
    AUTORIZACION_CAJA_RECHAZADA: 'AUTORIZACION_CAJA_RECHAZADA',
    CAMBIO_PERMISOS: 'CAMBIO_PERMISOS',
    GESTION_USUARIO: 'GESTION_USUARIO',
    GESTION_NOMINA: 'GESTION_NOMINA',
    GESTION_ROL: 'GESTION_ROL',
    GESTION_MENU_ESPECIAL: 'GESTION_MENU_ESPECIAL',
    EXPORTAR_AUDITORIA: 'EXPORTAR_AUDITORIA',
    CORTESIA_APLICADA: 'CORTESIA_APLICADA',
    AUTORIZACION_CORTESIA_RECHAZADA: 'AUTORIZACION_CORTESIA_RECHAZADA',
    // Servicio a Domicilio
    PEDIDO_DOMICILIO_CREADO: 'PEDIDO_DOMICILIO_CREADO',
    PEDIDO_DOMICILIO_ESTADO: 'PEDIDO_DOMICILIO_ESTADO',
    PEDIDO_DOMICILIO_ASIGNADO: 'PEDIDO_DOMICILIO_ASIGNADO',
    PEDIDO_DOMICILIO_CANCELADO: 'PEDIDO_DOMICILIO_CANCELADO',
    PEDIDO_DOMICILIO_FALLIDO: 'PEDIDO_DOMICILIO_FALLIDO',
    PEDIDO_DOMICILIO_LIQUIDADO: 'PEDIDO_DOMICILIO_LIQUIDADO',
    GESTION_ZONA_ENTREGA: 'GESTION_ZONA_ENTREGA',
    CLIENTE_BLOQUEO_WEB: 'CLIENTE_BLOQUEO_WEB',
};
// Códigos reservados para funcionalidades aún inexistentes en el POS (sin UI ni lógica)
const ACCIONES_AUDITORIA_RESERVADAS = {
    DESCUENTO_APLICADO: 'DESCUENTO_APLICADO',
    PROPINA_MODIFICADA: 'PROPINA_MODIFICADA',
    CAMBIO_METODO_PAGO: 'CAMBIO_METODO_PAGO',
    REAPERTURA_ORDEN: 'REAPERTURA_ORDEN',
    ELIMINACION_ITEM_COMANDA: 'ELIMINACION_ITEM_COMANDA',
    CAMBIO_MESA: 'CAMBIO_MESA',
    DIVISION_CUENTA: 'DIVISION_CUENTA',
};
// Severidades válidas para auditoría de investigación
const SEVERIDADES_AUDITORIA = {
    BAJA: 'BAJA',
    MEDIA: 'MEDIA',
    ALTA: 'ALTA',
};
// Catálogo estandarizado de códigos de motivo (complementa el campo libre `motivo`)
const CODIGOS_MOTIVO_AUDITORIA = {
    ERROR_DE_CAPTURA: 'ERROR_DE_CAPTURA',
    CLIENTE_CAMBIO_OPINION: 'CLIENTE_CAMBIO_OPINION',
    PRODUCTO_DANADO: 'PRODUCTO_DANADO',
    VENCIMIENTO: 'VENCIMIENTO',
    ERROR_PREPARACION: 'ERROR_PREPARACION',
    ACCIDENTE_COCINA: 'ACCIDENTE_COCINA',
    DIFERENCIA_DE_CAJA: 'DIFERENCIA_DE_CAJA',
    AJUSTE_DE_CONTEO: 'AJUSTE_DE_CONTEO',
    AUTORIZACION_SUPERVISOR: 'AUTORIZACION_SUPERVISOR',
    SEGURIDAD_ACCESO: 'SEGURIDAD_ACCESO',
    GESTION_CATALOGO: 'GESTION_CATALOGO',
    PEDIDO_NO_ENTREGADO: 'PEDIDO_NO_ENTREGADO',
    OTRO: 'OTRO',
};
// Catálogo base de permisos organizados por vista para RBAC configurable
const PERMISOS_CATALOGO = [
    // Menú / Ventas
    { codigo: 'ventas:ver', vista: 'ventas', accion: 'ver', descripcion: 'Acceder a Menú y Ventas' },
    { codigo: 'ventas:crear', vista: 'ventas', accion: 'crear', descripcion: 'Confirmar y cobrar ventas' },
    { codigo: 'ventas:autorizar_cortesia', vista: 'ventas', accion: 'autorizar_cortesia', descripcion: 'Autorizar cortesías' },
    { codigo: 'ventas:gestionar_menu', vista: 'ventas', accion: 'gestionar_menu', descripcion: 'Crear y editar platillos, precios y recetas' },
    // Facturas
    { codigo: 'facturas:ver', vista: 'facturas', accion: 'ver', descripcion: 'Consultar historial y detalle de facturas' },
    { codigo: 'facturas:reimprimir', vista: 'facturas', accion: 'reimprimir', descripcion: 'Reimprimir facturas emitidas' },
    { codigo: 'facturas:anular', vista: 'facturas', accion: 'anular', descripcion: 'Anular facturas con motivo' },
    // Inventario
    { codigo: 'inventario:ver', vista: 'inventario', accion: 'ver', descripcion: 'Ver ingredientes, existencias, alertas y kardex' },
    { codigo: 'inventario:gestionar', vista: 'inventario', accion: 'gestionar', descripcion: 'Crear y editar ingredientes y proveedores' },
    { codigo: 'inventario:comprar', vista: 'inventario', accion: 'comprar', descripcion: 'Registrar compras en libras con conversión a onzas' },
    { codigo: 'inventario:ajustar', vista: 'inventario', accion: 'ajustar', descripcion: 'Realizar ajustes manuales de inventario' },
    // Mermas
    { codigo: 'mermas:ver', vista: 'mermas', accion: 'ver', descripcion: 'Consultar historial de mermas' },
    { codigo: 'mermas:crear', vista: 'mermas', accion: 'crear', descripcion: 'Registrar mermas y desperdicios' },
    // Caja
    { codigo: 'caja:ver', vista: 'caja', accion: 'ver', descripcion: 'Ver estado, movimientos e historial de caja' },
    { codigo: 'caja:abrir', vista: 'caja', accion: 'abrir', descripcion: 'Abrir sesión de caja con monto inicial' },
    { codigo: 'caja:movimiento', vista: 'caja', accion: 'movimiento', descripcion: 'Registrar ingresos y egresos manuales de caja' },
    { codigo: 'caja:cerrar', vista: 'caja', accion: 'cerrar', descripcion: 'Ejecutar cierre diario y cuadre de caja' },
    { codigo: 'caja:autorizar', vista: 'caja', accion: 'autorizar', descripcion: 'Autorizar con usuario y contraseña la apertura y el cierre de caja de otros usuarios' },
    // Reportes
    { codigo: 'reportes:ver', vista: 'reportes', accion: 'ver', descripcion: 'Ver reportes de ventas, costos y estadísticas' },
    { codigo: 'reportes:balance', vista: 'reportes', accion: 'balance', descripcion: 'Consultar el balance económico' },
    { codigo: 'reportes:exportar', vista: 'reportes', accion: 'exportar', descripcion: 'Exportar reportes a PDF y Excel' },
    // Auditoría
    { codigo: 'auditoria:ver', vista: 'auditoria', accion: 'ver', descripcion: 'Consultar bitácora inmutable de auditoría' },
    { codigo: 'auditoria:economica', vista: 'auditoria', accion: 'economica', descripcion: 'Consultar la bitácora económica' },
    { codigo: 'auditoria:sistema', vista: 'auditoria', accion: 'sistema', descripcion: 'Consultar la bitácora del sistema' },
    { codigo: 'auditoria:exportar', vista: 'auditoria', accion: 'exportar', descripcion: 'Exportar bitácora de auditoría en formato CSV' },
    // Accesos (exclusivo Administrador)
    { codigo: 'accesos:ver', vista: 'accesos', accion: 'ver', descripcion: 'Ver usuarios, roles y permisos (solo Admin)' },
    { codigo: 'accesos:gestionar', vista: 'accesos', accion: 'gestionar', descripcion: 'Administrar usuarios, roles y permisos (solo Admin)' },
    // Servicio a Domicilio
    { codigo: 'domicilios:ver', vista: 'domicilios', accion: 'ver', descripcion: 'Ver tablero y detalle de pedidos a domicilio' },
    { codigo: 'domicilios:crear', vista: 'domicilios', accion: 'crear', descripcion: 'Registrar nuevos pedidos a domicilio y clientes' },
    { codigo: 'domicilios:asignar', vista: 'domicilios', accion: 'asignar', descripcion: 'Asignar o reasignar repartidor a pedidos a domicilio' },
    { codigo: 'domicilios:actualizar_estado', vista: 'domicilios', accion: 'actualizar_estado', descripcion: 'Avanzar estado de pedidos a domicilio según rol' },
    { codigo: 'domicilios:cancelar', vista: 'domicilios', accion: 'cancelar', descripcion: 'Cancelar pedidos a domicilio antes de despachar' },
    { codigo: 'domicilios:liquidar', vista: 'domicilios', accion: 'liquidar', descripcion: 'Liquidar cobros contra entrega en caja' },
    { codigo: 'domicilios:configurar', vista: 'domicilios', accion: 'configurar', descripcion: 'Administrar zonas de entrega, tarifas y pedido mínimo' },
    { codigo: 'domicilios:ver_propios', vista: 'domicilios', accion: 'ver_propios', descripcion: 'Ver únicamente los pedidos a domicilio asignados al propio repartidor' },
];

module.exports = {
  OZ_PER_LB,
  FACTURAS_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ROL_ADMIN_CODIGO,
  JWT_ALGORITHM,
  ACCIONES_AUDITORIA,
  ACCIONES_AUDITORIA_RESERVADAS,
  SEVERIDADES_AUDITORIA,
  CODIGOS_MOTIVO_AUDITORIA,
  PERMISOS_CATALOGO,
};
