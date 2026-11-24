const { CheckoutService } = require('./checkout.service');
const { MenuService } = require('./menu.service');
const { MenusEspecialesService } = require('./menus-especiales.service');
const { PlatillosService } = require('./platillos.service');

/**
 * Fachada de compatibilidad para VentasController y pruebas (Fase 4.2).
 * Delega cada responsabilidad a su servicio especializado sin cambiar la interfaz pública:
 * - MenuService: catálogo y disponibilidad del POS
 * - MenusEspecialesService: gestión y alertas de menús especiales por fecha
 * - PlatillosService: creación/edición de platillos y recetas
 * - CheckoutService: confirmación transaccional de ventas, mesas y comandas
 */
class VentasService {
  static obtenerMenu(user, search, categoriaId) {
    return MenuService.obtenerMenu(user, search, categoriaId);
  }

  static listarMenusEspeciales(sucursalId) {
    return MenusEspecialesService.listarMenusEspeciales(sucursalId);
  }

  static obtenerAlertasMenusEspeciales(sucursalId) {
    return MenusEspecialesService.obtenerAlertasMenusEspeciales(sucursalId);
  }

  static crearMenuEspecial(user, input, clientMeta) {
    return MenusEspecialesService.crearMenuEspecial(user, input, clientMeta);
  }

  static actualizarMenuEspecial(user, menuId, input, clientMeta) {
    return MenusEspecialesService.actualizarMenuEspecial(user, menuId, input, clientMeta);
  }

  static eliminarMenuEspecial(user, menuId, clientMeta) {
    return MenusEspecialesService.eliminarMenuEspecial(user, menuId, clientMeta);
  }

  static crearCategoria(user, input, clientMeta) {
    return PlatillosService.crearCategoria(user, input, clientMeta);
  }

  static crearPlatillo(user, input, clientMeta) {
    return PlatillosService.crearPlatillo(user, input, clientMeta);
  }

  static actualizarPlatillo(user, platilloId, input, clientMeta) {
    return PlatillosService.actualizarPlatillo(user, platilloId, input, clientMeta);
  }

  static confirmarVenta(user, input, clientMeta) {
    return CheckoutService.confirmarVenta(user, input, clientMeta);
  }

  static actualizarEstadoMesa(user, mesaId, estado) {
    return CheckoutService.actualizarEstadoMesa(user, mesaId, estado);
  }

  static obtenerComanda(ventaId, sucursalId, user) {
    return CheckoutService.obtenerComanda(ventaId, sucursalId, user);
  }
}

module.exports = { VentasService };
