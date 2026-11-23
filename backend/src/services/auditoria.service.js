const { Op, QueryTypes } = require('sequelize');
const {
  ACCIONES_AUDITORIA,
  CODIGOS_MOTIVO_AUDITORIA,
  SEVERIDADES_AUDITORIA,
} = require('../config/constants');
const { sequelize } = require('../config/database');
const { env } = require('../config/env');
const {
  AuditoriaLog,
  CajaSesion,
  Factura,
  Ingrediente,
  MenuEspecial,
  Platillo,
  Rol,
  Usuario,
  Venta,
} = require('../models');
const { NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const {
  construirFiltrosAuditoria,
  escaparCeldaCsv,
  expresionSqlSeveridadEfectiva,
} = require('../shared/utils/auditoriaFiltros');
const { calcularSeveridad } = require('../shared/utils/auditoriaSeveridad');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { round2 } = require('../shared/utils/tax');

const ENTIDADES_AUDITORIA = [
  'Factura',
  'Venta',
  'CajaSesion',
  'CajaMovimiento',
  'Ingrediente',
  'Compra',
  'Merma',
  'Platillo',
  'Categoria',
  'MenuEspecial',
  'Usuario',
  'Rol',
  'AuditoriaLog',
];

const INCLUDES_LISTADO = [
  {
    model: Usuario,
    as: 'usuario',
    attributes: ['id', 'username', 'nombreCompleto'],
    include: [{ model: Rol, as: 'rol', attributes: ['nombre', 'codigo'] }],
  },
  {
    model: Usuario,
    as: 'aprobador',
    attributes: ['id', 'username', 'nombreCompleto'],
    include: [{ model: Rol, as: 'rol', attributes: ['nombre', 'codigo'] }],
  },
  {
    model: CajaSesion,
    as: 'cajaSesion',
    attributes: ['id', 'estado', 'fechaApertura', 'fechaCierre'],
  },
];

function formatearLog(registro) {
  const plain = typeof registro.get === 'function' ? registro.get({ plain: true }) : { ...registro };
  const impactoFinanciero = plain.impactoFinanciero !== undefined && plain.impactoFinanciero !== null
    ? Number(plain.impactoFinanciero)
    : null;
  const severidad = plain.severidad
    ?? calcularSeveridad(plain.accion, {
      impactoFinanciero,
      valorNuevo: plain.valorNuevo,
    });
  return {
    ...plain,
    severidad,
    impactoFinanciero,
    actorRolCodigo: plain.actorRolCodigo ?? plain.usuario?.rol?.codigo ?? null,
  };
}

/**
 * Resuelve metadatos de navegación hacia la entidad origen para el panel de detalle en frontend.
 */
async function resolverEntidadOrigen(log, sucursalId) {
  const idNum = log.entidadId && /^\d+$/.test(String(log.entidadId)) ? Number(log.entidadId) : null;
  if (!idNum) return null;

  if (log.entidad === 'Factura') {
    const factura = await Factura.findOne({
      where: { id: idNum, sucursalId },
      attributes: ['id', 'numeroCompleto', 'estado', 'total'],
    });
    if (!factura) return null;
    return {
      tipo: 'Factura',
      id: factura.id,
      etiqueta: `Factura ${factura.numeroCompleto}`,
      ruta: `/facturas?numero=${encodeURIComponent(factura.numeroCompleto)}`,
      permisoRequerido: 'facturas:ver',
      extra: { estado: factura.estado, total: Number(factura.total) },
    };
  }

  if (log.entidad === 'Venta') {
    const venta = await Venta.findOne({
      where: { id: idNum, sucursalId },
      include: [{ model: Factura, as: 'factura', attributes: ['id', 'numeroCompleto'] }],
      attributes: ['id', 'total', 'estado'],
    });
    if (!venta) return null;
    const numero = venta.factura?.numeroCompleto ?? `#${venta.id}`;
    return {
      tipo: 'Venta',
      id: venta.id,
      etiqueta: venta.factura ? `Factura ${numero}` : `Venta #${venta.id}`,
      ruta: venta.factura
        ? `/facturas?numero=${encodeURIComponent(venta.factura.numeroCompleto)}`
        : '/facturas',
      permisoRequerido: 'facturas:ver',
    };
  }

  if (log.entidad === 'CajaSesion' || log.entidad === 'CajaMovimiento') {
    const sesionId = log.entidad === 'CajaSesion' ? idNum : log.cajaSesionId;
    if (!sesionId) return null;
    const sesion = await CajaSesion.findOne({
      where: { id: sesionId, sucursalId },
      attributes: ['id', 'estado'],
    });
    if (!sesion) return null;
    return {
      tipo: 'CajaSesion',
      id: sesion.id,
      etiqueta: `Turno de caja #${sesion.id}`,
      ruta: '/caja',
      permisoRequerido: 'caja:ver',
      extra: { estado: sesion.estado },
    };
  }

  if (log.entidad === 'Ingrediente') {
    const ing = await Ingrediente.findOne({
      where: { id: idNum, sucursalId },
      attributes: ['id', 'codigo', 'nombre'],
    });
    if (!ing) return null;
    return {
      tipo: 'Ingrediente',
      id: ing.id,
      etiqueta: `${ing.nombre} (${ing.codigo})`,
      ruta: '/inventario',
      permisoRequerido: 'inventario:ver',
    };
  }

  if (log.entidad === 'Platillo') {
    const platillo = await Platillo.findOne({
      where: { id: idNum, sucursalId },
      attributes: ['id', 'sku', 'nombre'],
    });
    if (!platillo) return null;
    return {
      tipo: 'Platillo',
      id: platillo.id,
      etiqueta: `${platillo.nombre} (${platillo.sku})`,
      ruta: '/inventario?tab=recetas',
      permisoRequerido: 'inventario:ver',
    };
  }

  if (log.entidad === 'MenuEspecial') {
    const menu = await MenuEspecial.findOne({
      where: { id: idNum, sucursalId },
      attributes: ['id', 'nombre'],
    });
    if (!menu) return null;
    return {
      tipo: 'MenuEspecial',
      id: menu.id,
      etiqueta: menu.nombre,
      ruta: '/menus-especiales',
      permisoRequerido: 'ventas:gestionar_menu',
      soloAdmin: true,
    };
  }

  if (log.entidad === 'Usuario') {
    const usr = await Usuario.findOne({
      where: { id: idNum, sucursalId },
      attributes: ['id', 'username', 'nombreCompleto'],
    });
    if (!usr) return null;
    return {
      tipo: 'Usuario',
      id: usr.id,
      etiqueta: `${usr.nombreCompleto} (@${usr.username})`,
      ruta: '/accesos',
      permisoRequerido: 'accesos:ver',
      soloAdmin: true,
    };
  }

  if (log.entidad === 'Merma') {
    return {
      tipo: 'Merma',
      id: idNum,
      etiqueta: `Merma #${idNum}`,
      ruta: '/mermas',
      permisoRequerido: 'mermas:ver',
    };
  }

  return null;
}

class AuditoriaService {
  static async listar(sucursalId, query, conNomina = false) {
    const { page, limit, skip } = parsePagination(query.page, query.limit, 15, 100);
    const { whereSequelize } = construirFiltrosAuditoria(sucursalId, query, conNomina);

    const { rows, count } = await AuditoriaLog.findAndCountAll({
      where: whereSequelize,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      offset: skip,
      limit,
      include: INCLUDES_LISTADO,
    });

    return {
      items: rows.map(formatearLog),
      meta: buildPaginationMeta(count, page, limit),
    };
  }

  static async obtenerDetalle(sucursalId, id, conNomina = false) {
    const log = await AuditoriaLog.findByPk(id, { include: INCLUDES_LISTADO });
    if (!log) {
      throw new NotFoundError('Registro de auditoría no encontrado');
    }
    if (log.sucursalId !== null && log.sucursalId !== sucursalId) {
      throw new NotFoundError('Registro de auditoría no encontrado');
    }
    if (!conNomina && log.accion === ACCIONES_AUDITORIA.GESTION_NOMINA) {
      throw new NotFoundError('Registro de auditoría no encontrado');
    }

    const formateado = formatearLog(log);
    const [entidadOrigen, correlacionados] = await Promise.all([
      resolverEntidadOrigen(formateado, sucursalId),
      formateado.correlacionId
        ? AuditoriaLog.findAll({
            where: {
              correlacionId: formateado.correlacionId,
              ...(conNomina ? {} : { accion: { [Op.ne]: ACCIONES_AUDITORIA.GESTION_NOMINA } }),
            },
            order: [['createdAt', 'ASC'], ['id', 'ASC']],
            include: INCLUDES_LISTADO,
          })
        : Promise.resolve([]),
    ]);

    return {
      ...formateado,
      entidadOrigen,
      eventosCorrelacionados: correlacionados
        .filter((ev) => ev.id !== formateado.id && (ev.sucursalId === null || ev.sucursalId === sucursalId))
        .map(formatearLog),
    };
  }

  /**
   * Resumen gerencial y alertas de investigación calculados íntegramente con agregaciones SQL (GROUP BY).
   */
  static async obtenerResumen(sucursalId, query, conNomina = false) {
    const { sqlWhere, replacements } = construirFiltrosAuditoria(sucursalId, query, conNomina);
    const exprSev = expresionSqlSeveridadEfectiva('a');
    const umbralRepeticion = env.AUDIT_REPETICION_UMBRAL;

    const [
      totalesRow,
      porSeveridadRows,
      rankingUsuariosRows,
      rankingAprobadoresRows,
      alertasAnulacionesRows,
      alertasAprobadorRows,
    ] = await Promise.all([
      sequelize.query(
        `SELECT
           COUNT(*)::int AS "totalEventos",
           COALESCE(SUM(CASE
             WHEN a."accion" = :accAnulacion THEN ABS(COALESCE(
               a."impacto_financiero",
               CASE WHEN (a."valor_anterior"->>'total') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                 THEN (a."valor_anterior"->>'total')::numeric ELSE 0 END
             ))
             ELSE 0
           END), 0) AS "impactoTotalAnulado",
           COALESCE(SUM(CASE
             WHEN a."accion" = :accCierre THEN COALESCE(
               a."impacto_financiero",
               CASE WHEN (a."valor_nuevo"->>'diferencia') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                 THEN (a."valor_nuevo"->>'diferencia')::numeric ELSE 0 END
             )
             ELSE 0
           END), 0) AS "diferenciaNetaCaja",
           COUNT(*) FILTER (WHERE a."accion" = :accReimpresion)::int AS "cantidadReimpresiones"
         FROM "auditoria_logs" a
         WHERE ${sqlWhere}`,
        {
          replacements: {
            ...replacements,
            accAnulacion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
            accCierre: ACCIONES_AUDITORIA.CIERRE_CAJA,
            accReimpresion: ACCIONES_AUDITORIA.REIMPRESION_FACTURA,
          },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT (${exprSev}) AS "severidad", COUNT(*)::int AS "total"
         FROM "auditoria_logs" a
         WHERE ${sqlWhere}
         GROUP BY 1`,
        { replacements, type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT
           a."usuario_id" AS "usuarioId",
           u."username",
           u."nombre_completo" AS "nombreCompleto",
           COALESCE(MAX(a."actor_rol_codigo"), r."codigo") AS "rolCodigo",
           r."nombre" AS "rolNombre",
           COUNT(*) FILTER (WHERE (${exprSev}) = 'ALTA')::int AS "eventosAlta",
           COUNT(*) FILTER (WHERE a."accion" = :accAnulacion)::int AS "anulaciones",
           COALESCE(SUM(ABS(COALESCE(a."impacto_financiero", 0))) FILTER (
             WHERE (${exprSev}) = 'ALTA' OR a."accion" = :accAnulacion
           ), 0) AS "impactoAcumulado"
         FROM "auditoria_logs" a
         JOIN "usuarios" u ON u."id" = a."usuario_id"
         LEFT JOIN "roles" r ON r."id" = u."rol_id"
         WHERE ${sqlWhere}
           AND a."usuario_id" IS NOT NULL
           AND ((${exprSev}) = 'ALTA' OR a."accion" = :accAnulacion)
         GROUP BY a."usuario_id", u."username", u."nombre_completo", r."codigo", r."nombre"
         ORDER BY "eventosAlta" DESC, "anulaciones" DESC, "impactoAcumulado" DESC
         LIMIT 10`,
        {
          replacements: {
            ...replacements,
            accAnulacion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
          },
          type: QueryTypes.SELECT,
        },
      ),
      sequelize.query(
        `SELECT
           a."aprobador_id" AS "aprobadorId",
           u."username",
           u."nombre_completo" AS "nombreCompleto",
           r."nombre" AS "rolNombre",
           COUNT(*)::int AS "totalAutorizaciones",
           COUNT(*) FILTER (
             WHERE a."accion" = :accCierre AND COALESCE(a."impacto_financiero", 0) <> 0
           )::int AS "cierresConDiferencia"
         FROM "auditoria_logs" a
         JOIN "usuarios" u ON u."id" = a."aprobador_id"
         LEFT JOIN "roles" r ON r."id" = u."rol_id"
         WHERE ${sqlWhere}
           AND a."aprobador_id" IS NOT NULL
         GROUP BY a."aprobador_id", u."username", u."nombre_completo", r."nombre"
         ORDER BY "totalAutorizaciones" DESC, "cierresConDiferencia" DESC
         LIMIT 10`,
        {
          replacements: {
            ...replacements,
            accCierre: ACCIONES_AUDITORIA.CIERRE_CAJA,
          },
          type: QueryTypes.SELECT,
        },
      ),
      // Alerta 1: mismo usuario con N+ anulaciones en un mismo turno de caja
      sequelize.query(
        `SELECT
           a."usuario_id" AS "usuarioId",
           u."username",
           u."nombre_completo" AS "nombreCompleto",
           a."caja_sesion_id" AS "cajaSesionId",
           COUNT(*)::int AS "cantidad",
           COALESCE(SUM(ABS(COALESCE(a."impacto_financiero", 0))), 0) AS "montoTotal"
         FROM "auditoria_logs" a
         JOIN "usuarios" u ON u."id" = a."usuario_id"
         WHERE ${sqlWhere}
           AND a."accion" = :accAnulacion
           AND a."usuario_id" IS NOT NULL
           AND a."caja_sesion_id" IS NOT NULL
         GROUP BY a."usuario_id", u."username", u."nombre_completo", a."caja_sesion_id"
         HAVING COUNT(*) >= :umbralRepeticion
         ORDER BY "cantidad" DESC, "montoTotal" DESC
         LIMIT 20`,
        {
          replacements: {
            ...replacements,
            accAnulacion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
            umbralRepeticion,
          },
          type: QueryTypes.SELECT,
        },
      ),
      // Alerta 2: mismo aprobador autorizando de forma recurrente al mismo usuario
      sequelize.query(
        `SELECT
           a."aprobador_id" AS "aprobadorId",
           ap."username" AS "aprobadorUsername",
           ap."nombre_completo" AS "aprobadorNombre",
           a."usuario_id" AS "usuarioId",
           u."username" AS "usuarioUsername",
           u."nombre_completo" AS "usuarioNombre",
           COUNT(*)::int AS "cantidad"
         FROM "auditoria_logs" a
         JOIN "usuarios" ap ON ap."id" = a."aprobador_id"
         JOIN "usuarios" u ON u."id" = a."usuario_id"
         WHERE ${sqlWhere}
           AND a."aprobador_id" IS NOT NULL
           AND a."usuario_id" IS NOT NULL
           AND a."aprobador_id" <> a."usuario_id"
         GROUP BY a."aprobador_id", ap."username", ap."nombre_completo", a."usuario_id", u."username", u."nombre_completo"
         HAVING COUNT(*) >= :umbralRepeticion
         ORDER BY "cantidad" DESC
         LIMIT 20`,
        {
          replacements: {
            ...replacements,
            umbralRepeticion,
          },
          type: QueryTypes.SELECT,
        },
      ),
    ]);

    const totales = totalesRow[0] ?? {};
    const porSeveridad = {
      [SEVERIDADES_AUDITORIA.BAJA]: 0,
      [SEVERIDADES_AUDITORIA.MEDIA]: 0,
      [SEVERIDADES_AUDITORIA.ALTA]: 0,
    };
    for (const fila of porSeveridadRows) {
      if (fila.severidad in porSeveridad) {
        porSeveridad[fila.severidad] = Number(fila.total);
      }
    }

    const alertas = [
      ...alertasAnulacionesRows.map((a) => ({
        tipo: 'ANULACIONES_REPETIDAS_TURNO',
        severidad: SEVERIDADES_AUDITORIA.ALTA,
        titulo: `${a.nombreCompleto} acumuló ${a.cantidad} anulaciones en el turno #${a.cajaSesionId}`,
        detalle: `Monto acumulado anulado: Q ${round2(Number(a.montoTotal)).toFixed(2)} (umbral: ${umbralRepeticion}+).`,
        usuarioId: Number(a.usuarioId),
        cajaSesionId: Number(a.cajaSesionId),
        cantidad: Number(a.cantidad),
        montoTotal: round2(Number(a.montoTotal)),
      })),
      ...alertasAprobadorRows.map((a) => ({
        tipo: 'APROBADOR_RECURRENTE',
        severidad: SEVERIDADES_AUDITORIA.MEDIA,
        titulo: `${a.aprobadorNombre} autorizó ${a.cantidad} veces a ${a.usuarioNombre}`,
        detalle: `Patrón recurrente entre supervisor (@${a.aprobadorUsername}) y operador (@${a.usuarioUsername}) en el período consultado.`,
        aprobadorId: Number(a.aprobadorId),
        usuarioId: Number(a.usuarioId),
        cantidad: Number(a.cantidad),
      })),
    ];

    return {
      totalEventos: Number(totales.totalEventos ?? 0),
      porSeveridad,
      impactoTotalAnulado: round2(Number(totales.impactoTotalAnulado ?? 0)),
      diferenciaNetaCaja: round2(Number(totales.diferenciaNetaCaja ?? 0)),
      cantidadReimpresiones: Number(totales.cantidadReimpresiones ?? 0),
      umbrales: {
        impactoAltoQ: env.AUDIT_IMPACTO_ALTO_Q,
        diferenciaCajaAltaQ: env.AUDIT_DIFERENCIA_CAJA_ALTA_Q,
        repeticionUmbral: umbralRepeticion,
      },
      rankingUsuariosRiesgo: rankingUsuariosRows.map((r) => ({
        usuarioId: Number(r.usuarioId),
        username: r.username,
        nombreCompleto: r.nombreCompleto,
        rolCodigo: r.rolCodigo,
        rolNombre: r.rolNombre,
        eventosAlta: Number(r.eventosAlta),
        anulaciones: Number(r.anulaciones),
        impactoAcumulado: round2(Number(r.impactoAcumulado)),
      })),
      rankingAprobadores: rankingAprobadoresRows.map((r) => ({
        aprobadorId: Number(r.aprobadorId),
        username: r.username,
        nombreCompleto: r.nombreCompleto,
        rolNombre: r.rolNombre,
        totalAutorizaciones: Number(r.totalAutorizaciones),
        cierresConDiferencia: Number(r.cierresConDiferencia),
      })),
      alertas,
    };
  }

  /**
   * Exporta la bitácora filtrada en CSV por lotes (streaming al `res`) con límite máximo configurable.
   * Registra automáticamente el evento `EXPORTAR_AUDITORIA` con filtros usados y total de filas.
   */
  static async exportarCsv(user, query, clientMeta, res, conNomina = false) {
    const { whereSequelize, filtrosAplicados } = construirFiltrosAuditoria(
      user.sucursalId,
      query,
      conNomina,
    );
    const maxRows = env.AUDIT_EXPORT_MAX_ROWS;
    const batchSize = 500;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria_pos.csv"');
    res.setHeader('Cache-Control', 'no-store');

    // BOM UTF-8 para compatibilidad directa con Excel en español
    const encabezados = [
      'ID',
      'Fecha_Hora_ISO',
      'Severidad',
      'Accion',
      'Usuario',
      'Username',
      'Rol_Actor',
      'Aprobador',
      'Turno_Caja',
      'Entidad',
      'Entidad_ID',
      'Impacto_Q',
      'Codigo_Motivo',
      'Motivo',
      'Correlacion_ID',
      'IP',
    ];
    res.write(`\uFEFF${encabezados.join(',')}\r\n`);

    let exportadas = 0;
    let truncado = false;
    let offset = 0;

    while (exportadas < maxRows) {
      const restante = maxRows - exportadas;
      const limitLote = Math.min(batchSize, restante + 1);

      const filas = await AuditoriaLog.findAll({
        where: whereSequelize,
        order: [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ],
        offset,
        limit: limitLote,
        include: INCLUDES_LISTADO,
      });

      if (filas.length === 0) break;

      const hayMasDelLimite = filas.length > restante;
      const loteAProcesar = hayMasDelLimite ? filas.slice(0, restante) : filas;

      for (const raw of loteAProcesar) {
        const log = formatearLog(raw);
        const linea = [
          log.id,
          log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
          log.severidad,
          log.accion,
          log.usuario?.nombreCompleto ?? 'Sistema',
          log.usuario?.username ?? '',
          log.actorRolCodigo ?? '',
          log.aprobador ? `${log.aprobador.nombreCompleto} (@${log.aprobador.username})` : '',
          log.cajaSesionId ?? '',
          log.entidad,
          log.entidadId ?? '',
          log.impactoFinanciero !== null ? log.impactoFinanciero.toFixed(2) : '',
          log.codigoMotivo ?? '',
          log.motivo ?? '',
          log.correlacionId ?? '',
          log.ipAddress ?? '',
        ]
          .map(escaparCeldaCsv)
          .join(',');
        res.write(`${linea}\r\n`);
        exportadas++;
      }

      if (hayMasDelLimite) {
        truncado = true;
        break;
      }
      if (filas.length < limitLote) break;
      offset += loteAProcesar.length;
    }

    await AuditService.registrarEvento(
      { user, clientMeta },
      {
        accion: ACCIONES_AUDITORIA.EXPORTAR_AUDITORIA,
        entidad: 'AuditoriaLog',
        valorNuevo: {
          formato: 'CSV',
          filtros: filtrosAplicados,
          filasExportadas: exportadas,
          limiteMaximo: maxRows,
          truncado,
        },
        motivo: `Exportación CSV de auditoría (${exportadas} registros)`,
      },
    );

    res.end();
    return { filasExportadas: exportadas, truncado };
  }

  static async obtenerCatalogoFiltros(sucursalId, conNomina = false) {
    const [usuarios, turnos] = await Promise.all([
      Usuario.findAll({
        where: { sucursalId },
        order: [['nombreCompleto', 'ASC']],
        attributes: ['id', 'username', 'nombreCompleto'],
        include: [{ model: Rol, as: 'rol', attributes: ['codigo', 'nombre'] }],
      }),
      CajaSesion.findAll({
        where: { sucursalId },
        order: [['fechaApertura', 'DESC']],
        limit: 50,
        attributes: ['id', 'estado', 'fechaApertura', 'fechaCierre'],
      }),
    ]);

    const usuariosPlanos = usuarios.map((u) => {
      const plain = u.get({ plain: true });
      return {
        id: plain.id,
        username: plain.username,
        nombreCompleto: plain.nombreCompleto,
        rolCodigo: plain.rol?.codigo ?? null,
        rolNombre: plain.rol?.nombre ?? null,
      };
    });

    // Los aprobadores habituales son Administradores y Auditores
    const aprobadores = usuariosPlanos.filter(
      (u) => u.rolCodigo === 'ADMIN' || u.rolCodigo === 'AUDITOR',
    );

    return {
      acciones: Object.values(ACCIONES_AUDITORIA).filter(
        (accion) => conNomina || accion !== ACCIONES_AUDITORIA.GESTION_NOMINA,
      ),
      usuarios: usuariosPlanos,
      aprobadores,
      turnos: turnos.map((t) => t.get({ plain: true })),
      severidades: Object.values(SEVERIDADES_AUDITORIA),
      codigosMotivo: Object.values(CODIGOS_MOTIVO_AUDITORIA),
      entidades: ENTIDADES_AUDITORIA,
    };
  }

  static async listarNomina(sucursalId) {
    const personas = await Usuario.findAll({
      where: { sucursalId },
      attributes: ['id', 'nombreCompleto', 'activo', 'fechaIngreso', 'sueldoMensual'],
      include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }],
      order: [
        ['activo', 'DESC'],
        ['nombreCompleto', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return personas.map((persona) => ({
      id: persona.id,
      nombreCompleto: persona.nombreCompleto,
      rol: persona.rol?.nombre ?? '',
      activo: persona.activo,
      fechaIngreso: persona.fechaIngreso,
      sueldoMensual: persona.sueldoMensual ? Number(persona.sueldoMensual) : null,
    }));
  }
}

module.exports = { AuditoriaService };
