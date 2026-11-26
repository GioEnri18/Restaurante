// Registro central de los 31 modelos Sequelize y TODAS sus asociaciones relacionales (Capa Modelo MVC)
const { Permiso, Rol, RolPermiso, Sucursal, Usuario, UsuarioPermiso } = require('./seguridad.models');
const { Categoria, MenuEspecial, MenuEspecialPlatillo, Mesa, Platillo, PlatilloFoto, RecetaIngrediente } = require('./menu.models');
const { Compra, CompraDetalle, Ingrediente, InventarioMovimiento, Merma, Proveedor } = require('./inventario.models');
const { AuditoriaLog, CajaMovimiento, CajaSesion, Comanda, Factura, Venta, VentaDetalle } = require('./operaciones.models');
const {
  Cliente,
  DireccionEntrega,
  PedidoDomicilio,
  PedidoDomicilioDetalle,
  PedidoDomicilioHistorial,
  ZonaEntrega,
} = require('./domicilios.models');
// --- Seguridad & RBAC ---
Sucursal.hasMany(Usuario, { foreignKey: 'sucursalId', as: 'usuarios' });
Usuario.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
Rol.hasMany(Usuario, { foreignKey: 'rolId', as: 'usuarios' });
Usuario.belongsTo(Rol, { foreignKey: 'rolId', as: 'rol' });
Rol.hasMany(RolPermiso, { foreignKey: 'rolId', as: 'rolPermisos' });
RolPermiso.belongsTo(Rol, { foreignKey: 'rolId', as: 'rol' });
Permiso.hasMany(RolPermiso, { foreignKey: 'permisoId', as: 'rolPermisos' });
RolPermiso.belongsTo(Permiso, { foreignKey: 'permisoId', as: 'permiso' });
Usuario.hasMany(UsuarioPermiso, { foreignKey: 'usuarioId', as: 'usuarioPermisos' });
UsuarioPermiso.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Permiso.hasMany(UsuarioPermiso, { foreignKey: 'permisoId', as: 'usuarioPermisos' });
UsuarioPermiso.belongsTo(Permiso, { foreignKey: 'permisoId', as: 'permiso' });
// --- Menú, Recetas, Menús Especiales y Mesas ---
Categoria.hasMany(Platillo, { foreignKey: 'categoriaId', as: 'platillos' });
Platillo.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'categoria' });
Platillo.hasMany(RecetaIngrediente, { foreignKey: 'platilloId', as: 'receta' });
RecetaIngrediente.belongsTo(Platillo, { foreignKey: 'platilloId', as: 'platillo' });
Ingrediente.hasMany(RecetaIngrediente, { foreignKey: 'ingredienteId', as: 'recetas' });
RecetaIngrediente.belongsTo(Ingrediente, { foreignKey: 'ingredienteId', as: 'ingrediente' });
MenuEspecial.belongsTo(Usuario, { foreignKey: 'creadoPorId', as: 'creadoPor' });
MenuEspecial.hasMany(MenuEspecialPlatillo, { foreignKey: 'menuEspecialId', as: 'platillos' });
MenuEspecialPlatillo.belongsTo(MenuEspecial, { foreignKey: 'menuEspecialId', as: 'menuEspecial' });
Platillo.hasMany(MenuEspecialPlatillo, { foreignKey: 'platilloId', as: 'menusEspeciales' });
MenuEspecialPlatillo.belongsTo(Platillo, { foreignKey: 'platilloId', as: 'platillo' });
// --- Inventario, Proveedores, Compras y Mermas ---
Proveedor.hasMany(Ingrediente, { foreignKey: 'proveedorId', as: 'ingredientes' });
Ingrediente.belongsTo(Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
Proveedor.hasMany(Compra, { foreignKey: 'proveedorId', as: 'compras' });
Compra.belongsTo(Proveedor, { foreignKey: 'proveedorId', as: 'proveedor' });
Compra.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Compra.hasMany(CompraDetalle, { foreignKey: 'compraId', as: 'detalles' });
CompraDetalle.belongsTo(Compra, { foreignKey: 'compraId', as: 'compra' });
CompraDetalle.belongsTo(Ingrediente, { foreignKey: 'ingredienteId', as: 'ingrediente' });
InventarioMovimiento.belongsTo(Ingrediente, { foreignKey: 'ingredienteId', as: 'ingrediente' });
InventarioMovimiento.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Merma.belongsTo(Ingrediente, { foreignKey: 'ingredienteId', as: 'ingrediente' });
Merma.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
// --- Caja, Ventas, Facturas, Comandas y Auditoría ---
CajaSesion.belongsTo(Usuario, { foreignKey: 'usuarioAperturaId', as: 'usuarioApertura' });
CajaSesion.belongsTo(Usuario, { foreignKey: 'usuarioCierreId', as: 'usuarioCierre' });
CajaSesion.hasMany(CajaMovimiento, { foreignKey: 'cajaSesionId', as: 'movimientos' });
CajaMovimiento.belongsTo(CajaSesion, { foreignKey: 'cajaSesionId', as: 'cajaSesion' });
CajaMovimiento.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Venta.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
Venta.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
Venta.belongsTo(Mesa, { foreignKey: 'mesaId', as: 'mesa' });
Venta.belongsTo(CajaSesion, { foreignKey: 'cajaSesionId', as: 'cajaSesion' });
Venta.hasMany(VentaDetalle, { foreignKey: 'ventaId', as: 'detalles' });
VentaDetalle.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Venta.hasOne(Factura, { foreignKey: 'ventaId', as: 'factura' });
Factura.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Factura.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
Factura.belongsTo(Usuario, { foreignKey: 'anuladaPorId', as: 'anuladaPor' });
Venta.hasOne(Comanda, { foreignKey: 'ventaId', as: 'comanda' });
Comanda.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Comanda.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
AuditoriaLog.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
AuditoriaLog.belongsTo(Usuario, { foreignKey: 'aprobadorId', as: 'aprobador' });
AuditoriaLog.belongsTo(CajaSesion, { foreignKey: 'cajaSesionId', as: 'cajaSesion' });
// --- Servicio a Domicilio ---
Sucursal.hasMany(ZonaEntrega, { foreignKey: 'sucursalId', as: 'zonasEntrega' });
ZonaEntrega.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
Sucursal.hasMany(Cliente, { foreignKey: 'sucursalId', as: 'clientes' });
Cliente.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
Cliente.hasMany(DireccionEntrega, { foreignKey: 'clienteId', as: 'direcciones' });
DireccionEntrega.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
DireccionEntrega.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
DireccionEntrega.belongsTo(ZonaEntrega, { foreignKey: 'zonaEntregaId', as: 'zonaEntrega' });
ZonaEntrega.hasMany(DireccionEntrega, { foreignKey: 'zonaEntregaId', as: 'direcciones' });
PedidoDomicilio.belongsTo(Sucursal, { foreignKey: 'sucursalId', as: 'sucursal' });
PedidoDomicilio.belongsTo(Cliente, { foreignKey: 'clienteId', as: 'cliente' });
Cliente.hasMany(PedidoDomicilio, { foreignKey: 'clienteId', as: 'pedidosDomicilio' });
PedidoDomicilio.belongsTo(DireccionEntrega, { foreignKey: 'direccionEntregaId', as: 'direccionEntrega' });
PedidoDomicilio.belongsTo(ZonaEntrega, { foreignKey: 'zonaEntregaId', as: 'zonaEntrega' });
ZonaEntrega.hasMany(PedidoDomicilio, { foreignKey: 'zonaEntregaId', as: 'pedidosDomicilio' });
PedidoDomicilio.belongsTo(Usuario, { foreignKey: 'creadoPorId', as: 'creadoPor' });
PedidoDomicilio.belongsTo(Usuario, { foreignKey: 'repartidorId', as: 'repartidor' });
PedidoDomicilio.belongsTo(Usuario, { foreignKey: 'liquidadoPorId', as: 'liquidadoPor' });
PedidoDomicilio.belongsTo(Venta, { foreignKey: 'ventaId', as: 'venta' });
Venta.belongsTo(PedidoDomicilio, { foreignKey: 'pedidoDomicilioId', as: 'pedidoDomicilio' });
PedidoDomicilio.hasOne(Comanda, { foreignKey: 'pedidoDomicilioId', as: 'comanda' });
Comanda.belongsTo(PedidoDomicilio, { foreignKey: 'pedidoDomicilioId', as: 'pedidoDomicilio' });
PedidoDomicilio.hasMany(PedidoDomicilioDetalle, { foreignKey: 'pedidoDomicilioId', as: 'detalles' });
PedidoDomicilioDetalle.belongsTo(PedidoDomicilio, { foreignKey: 'pedidoDomicilioId', as: 'pedidoDomicilio' });
PedidoDomicilioDetalle.belongsTo(Platillo, { foreignKey: 'platilloId', as: 'platillo' });
PedidoDomicilio.hasMany(PedidoDomicilioHistorial, { foreignKey: 'pedidoDomicilioId', as: 'historial' });
PedidoDomicilioHistorial.belongsTo(PedidoDomicilio, { foreignKey: 'pedidoDomicilioId', as: 'pedidoDomicilio' });
PedidoDomicilioHistorial.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
PedidoDomicilio.hasMany(Merma, { foreignKey: 'pedidoDomicilioId', as: 'mermas' });
Merma.belongsTo(PedidoDomicilio, { foreignKey: 'pedidoDomicilioId', as: 'pedidoDomicilio' });

module.exports = {
  ...require('./enums'),
  Sucursal,
  Rol,
  Permiso,
  RolPermiso,
  Usuario,
  UsuarioPermiso,
  Categoria,
  Platillo,
  PlatilloFoto,
  RecetaIngrediente,
  Mesa,
  MenuEspecial,
  MenuEspecialPlatillo,
  Proveedor,
  Ingrediente,
  Compra,
  CompraDetalle,
  InventarioMovimiento,
  Merma,
  CajaSesion,
  CajaMovimiento,
  Venta,
  VentaDetalle,
  Factura,
  Comanda,
  AuditoriaLog,
  ZonaEntrega,
  Cliente,
  DireccionEntrega,
  PedidoDomicilio,
  PedidoDomicilioDetalle,
  PedidoDomicilioHistorial,
};
