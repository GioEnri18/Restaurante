const { Op } = require('sequelize');
const { env } = require('../config/env');
const {
  CajaSesion,
  Categoria,
  EstadoCaja,
  Ingrediente,
  MenuEspecial,
  MenuEspecialPlatillo,
  Mesa,
  Platillo,
  RecetaIngrediente,
  Usuario,
} = require('../models');
const {
  diffCalendarDaysInTimezone,
  endOfDayInTimezone,
  nowInTimezone,
  startOfDayInTimezone,
} = require('../shared/utils/dates');
const { round2 } = require('../shared/utils/tax');

/**
 * Evalúa el estado de vigencia de un menú especial usando explícitamente env.DEFAULT_TIMEZONE (America/Guatemala).
 */
function evaluarEstadoMenuEspecial(menu) {
  const ahora = nowInTimezone().toJSDate();
  const inicioDia = startOfDayInTimezone(menu.fechaInicio);
  const finDia = endOfDayInTimezone(menu.fechaFin);
  const diasRestantes = diffCalendarDaysInTimezone(menu.fechaInicio, ahora);
  const platillosCount = menu.platillos?.length ?? 0;

  if (!menu.activo) {
    return { estado: 'INACTIVO', diasRestantes, requiereAtencion: false, mensajeAviso: null };
  }

  if (ahora >= inicioDia && ahora <= finDia) {
    const sinPlatillos = platillosCount === 0;
    return {
      estado: 'ACTIVO_HOY',
      diasRestantes: 0,
      requiereAtencion: sinPlatillos,
      mensajeAviso: sinPlatillos
        ? `¡El menú especial "${menu.nombre}" está activo hoy pero aún no tiene platillos asignados!`
        : 'Menú especial activo y vigente hoy en el punto de venta.',
    };
  }

  if (ahora > finDia) {
    return { estado: 'FINALIZADO', diasRestantes, requiereAtencion: false, mensajeAviso: null };
  }

  if (diasRestantes <= menu.diasAvisoPrevio) {
    const faltanPlatillos = platillosCount === 0;
    return {
      estado: 'PROXIMO_AVISO',
      diasRestantes,
      requiereAtencion: true,
      mensajeAviso: faltanPlatillos
        ? `Inicia en ${diasRestantes} día(s) y aún falta agregar platillos al menú.`
        : `Inicia en ${diasRestantes} día(s) con ${platillosCount} platillo(s) listo(s) para el cambio.`,
    };
  }

  return { estado: 'PROGRAMADO', diasRestantes, requiereAtencion: false, mensajeAviso: null };
}

class MenuService {
  static async obtenerMenu(sucursalId, search, categoriaId) {
    const platilloWhere = {
      activo: true,
      ...(categoriaId ? { categoriaId } : {}),
      ...(search
        ? {
            [Op.or]: [
              { nombre: { [Op.iLike]: `%${search}%` } },
              { descripcion: { [Op.iLike]: `%${search}%` } },
              { sku: { [Op.iLike]: `%${search}%` } },
            ],
          }
        : {}),
    };

    const [categorias, platillos, mesas, cajaAbierta, menusEspeciales] = await Promise.all([
      Categoria.findAll({
        where: {
          activa: true,
          [Op.or]: [{ sucursalId }, { sucursalId: null }],
        },
        order: [
          ['orden', 'ASC'],
          ['nombre', 'ASC'],
        ],
      }),
      Platillo.findAll({
        where: platilloWhere,
        include: [
          { model: Categoria, as: 'categoria', attributes: ['id', 'nombre', 'orden'] },
          {
            model: RecetaIngrediente,
            as: 'receta',
            include: [
              {
                model: Ingrediente,
                as: 'ingrediente',
                attributes: ['id', 'codigo', 'nombre', 'stockActualOz', 'costoPromedioOz'],
              },
            ],
          },
        ],
        order: [
          [{ model: Categoria, as: 'categoria' }, 'orden', 'ASC'],
          ['nombre', 'ASC'],
        ],
      }),
      Mesa.findAll({
        where: { sucursalId, activa: true },
        order: [['numero', 'ASC']],
      }),
      CajaSesion.findOne({
        where: { sucursalId, estado: EstadoCaja.ABIERTA },
        attributes: ['id', 'fechaApertura', 'montoInicial'],
      }),
      MenuEspecial.findAll({
        where: { sucursalId },
        order: [
          ['fechaInicio', 'ASC'],
          ['id', 'DESC'],
        ],
        include: [
          { model: Usuario, as: 'creadoPor', attributes: ['id', 'nombreCompleto'] },
          {
            model: MenuEspecialPlatillo,
            as: 'platillos',
            include: [
              {
                model: Platillo,
                as: 'platillo',
                attributes: ['id', 'sku', 'nombre', 'precioVenta', 'categoriaId'],
              },
            ],
          },
        ],
      }),
    ]);

    const menusEvaluados = menusEspeciales.map((m) => ({
      menu: m,
      eval: evaluarEstadoMenuEspecial(m),
    }));

    const menuEspecialActivo =
      menusEvaluados.find((m) => m.eval.estado === 'ACTIVO_HOY')?.menu ?? null;

    const alertasMenusEspeciales = menusEvaluados
      .filter((m) => m.eval.estado === 'PROXIMO_AVISO' || m.eval.estado === 'ACTIVO_HOY')
      .map((m) => ({
        id: m.menu.id,
        nombre: m.menu.nombre,
        fechaInicio: m.menu.fechaInicio,
        fechaFin: m.menu.fechaFin,
        estado: m.eval.estado,
        diasRestantes: m.eval.diasRestantes,
        platillosCount: m.menu.platillos?.length ?? 0,
        requiereAtencion: m.eval.requiereAtencion,
        mensaje: m.eval.mensajeAviso,
      }));

    const mapaEspecialHoy = new Map();
    if (menuEspecialActivo) {
      for (const mp of menuEspecialActivo.platillos ?? []) {
        mapaEspecialHoy.set(mp.platilloId, {
          precioEspecial: mp.precioEspecial !== null ? Number(mp.precioEspecial) : null,
        });
      }
    }

    const platillosFormateados = platillos.map((p) => {
      const receta = p.receta ?? [];
      const costoReceta = round2(
        receta.reduce(
          (acc, item) =>
            acc + Number(item.cantidadOz) * Number(item.ingrediente?.costoPromedioOz ?? 0),
          0,
        ),
      );
      const stockDisponible = receta.every(
        (item) => Number(item.ingrediente?.stockActualOz ?? 0) >= Number(item.cantidadOz),
      );
      const especial = mapaEspecialHoy.get(p.id);
      const precioBase = Number(p.precioVenta);
      const precioVigente = especial?.precioEspecial ?? precioBase;

      return {
        id: p.id,
        categoriaId: p.categoriaId,
        categoriaNombre: p.categoria?.nombre ?? '',
        sku: p.sku,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioVenta: precioVigente,
        precioRegular: precioBase,
        esEspecialHoy: Boolean(especial),
        costoReceta,
        disponible: p.disponible,
        stockDisponible,
        receta: receta.map((r) => ({
          ingredienteId: r.ingredienteId,
          ingredienteNombre: r.ingrediente?.nombre ?? '',
          cantidadOz: Number(r.cantidadOz),
          stockActualOz: Number(r.ingrediente?.stockActualOz ?? 0),
        })),
      };
    });

    return {
      cajaAbierta: Boolean(cajaAbierta),
      cajaSesionId: cajaAbierta?.id ?? null,
      habilitarMesas: env.ENABLE_TABLE_SERVICE,
      tipoServicioDefault: env.DEFAULT_SERVICE_TYPE,
      categorias: categorias.map((c) => c.get({ plain: true })),
      platillos: platillosFormateados,
      mesas: mesas.map((m) => m.get({ plain: true })),
      menuEspecialActivo: menuEspecialActivo
        ? {
            id: menuEspecialActivo.id,
            nombre: menuEspecialActivo.nombre,
            descripcion: menuEspecialActivo.descripcion,
            fechaInicio: menuEspecialActivo.fechaInicio,
            fechaFin: menuEspecialActivo.fechaFin,
            esMenuPrincipal: menuEspecialActivo.esMenuPrincipal,
            platillosIds: (menuEspecialActivo.platillos ?? []).map((mp) => mp.platilloId),
          }
        : null,
      alertasMenusEspeciales,
    };
  }
}

module.exports = { MenuService, evaluarEstadoMenuEspecial };
