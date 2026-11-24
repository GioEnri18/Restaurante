import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, ShieldCheck } from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  AuditoriaAlertaModel,
  AuditoriaCatalogoModel,
  AuditoriaDetalleModel,
  AuditoriaFiltrosState,
  AuditoriaLogModel,
  AuditoriaResumenModel,
  PaginationMeta,
  SeveridadAuditoria,
} from '../../models';
import { AuditoriaQueryParams, auditoriaService } from '../../services/auditoria.service';
import { isAbortError } from '../../services/httpClient';
import { useAuthStore } from '../../store/auth.store';
import { Alert } from '../components/common/Alert';
import { AuditoriaDetalleDrawer } from '../components/auditoria/AuditoriaDetalleDrawer';
import { AuditoriaFiltros } from '../components/auditoria/AuditoriaFiltros';
import { AuditoriaResumen } from '../components/auditoria/AuditoriaResumen';
import { AuditoriaTabla } from '../components/auditoria/AuditoriaTabla';

const FILTROS_INICIALES: AuditoriaFiltrosState = {
  fechaDesde: '',
  fechaHasta: '',
  usuarioId: '',
  aprobadorId: '',
  accion: '',
  severidad: '',
  cajaSesionId: '',
  impactoMin: '',
};

const CATALOGO_INICIAL: AuditoriaCatalogoModel = {
  acciones: [],
  usuarios: [],
  aprobadores: [],
  turnos: [],
  severidades: ['BAJA', 'MEDIA', 'ALTA'],
  codigosMotivo: [],
  entidades: [],
};

export const AuditoriaPage: React.FC = () => {
  const puedeExportar = useAuthStore((s) => s.can('auditoria:exportar'));
  const [filtros, setFiltros] = useState<AuditoriaFiltrosState>(FILTROS_INICIALES);
  const debouncedImpactoMin = useDebouncedValue(filtros.impactoMin, 350);

  const [catalogo, setCatalogo] = useState<AuditoriaCatalogoModel>(CATALOGO_INICIAL);
  const [logs, setLogs] = useState<AuditoriaLogModel[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [resumen, setResumen] = useState<AuditoriaResumenModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del drawer de detalle
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fallbackLog, setFallbackLog] = useState<AuditoriaLogModel | null>(null);
  const [detalle, setDetalle] = useState<AuditoriaDetalleModel | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const abortListaRef = useRef<AbortController | null>(null);
  const abortDetalleRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Carga del catálogo de filtros (acciones, usuarios, aprobadores, turnos)
  useEffect(() => {
    const controller = new AbortController();
    void auditoriaService
      .obtenerCatalogo(controller.signal, 'sistema')
      .then((cat) => {
        if (!controller.signal.aborted) setCatalogo(cat);
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          console.error('[AuditoriaPage] Error cargando catálogo de filtros:', err);
        }
      });
    return () => controller.abort();
  }, []);

  const construirQuery = useCallback(
    (): AuditoriaQueryParams => ({
      ambito: 'sistema',
      fechaDesde: filtros.fechaDesde || undefined,
      fechaHasta: filtros.fechaHasta || undefined,
      usuarioId: filtros.usuarioId || undefined,
      aprobadorId: filtros.aprobadorId || undefined,
      accion: filtros.accion || undefined,
      severidad: filtros.severidad || undefined,
      cajaSesionId: filtros.cajaSesionId || undefined,
      impactoMin: debouncedImpactoMin.trim() || undefined,
    }),
    [
      filtros.fechaDesde,
      filtros.fechaHasta,
      filtros.usuarioId,
      filtros.aprobadorId,
      filtros.accion,
      filtros.severidad,
      filtros.cajaSesionId,
      debouncedImpactoMin,
    ],
  );

  const cargar = useCallback(
    async (page = 1, recargarResumen = true) => {
      abortListaRef.current?.abort();
      const controller = new AbortController();
      abortListaRef.current = controller;
      const reqId = ++requestIdRef.current;

      setLoading(true);
      setError(null);
      const query = construirQuery();

      try {
        const [resLista, resResumen] = await Promise.all([
          auditoriaService.listar({ ...query, page }, controller.signal),
          recargarResumen
            ? auditoriaService.obtenerResumen(query, controller.signal)
            : Promise.resolve(null),
        ]);
        if (reqId !== requestIdRef.current || controller.signal.aborted) return;
        setLogs(resLista.items);
        setMeta(resLista.meta);
        if (resResumen) setResumen(resResumen);
      } catch (err) {
        if (isAbortError(err) || reqId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Error cargando bitácora de auditoría');
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    },
    [construirQuery],
  );

  // Al cambiar cualquier filtro vuelve automáticamente a la página 1 y cancela peticiones previas
  useEffect(() => {
    void cargar(1, true);
    return () => {
      abortListaRef.current?.abort();
    };
  }, [cargar]);

  useEffect(() => {
    return () => {
      abortDetalleRef.current?.abort();
    };
  }, []);

  const hayFiltros = Boolean(
    filtros.fechaDesde ||
      filtros.fechaHasta ||
      filtros.usuarioId ||
      filtros.aprobadorId ||
      filtros.accion ||
      filtros.severidad ||
      filtros.cajaSesionId ||
      filtros.impactoMin.trim(),
  );

  const actualizarFiltros = (parcial: Partial<AuditoriaFiltrosState>) => {
    setFiltros((actual) => ({ ...actual, ...parcial }));
  };

  const limpiarFiltros = () => {
    setFiltros(FILTROS_INICIALES);
  };

  const abrirDetalle = async (log: AuditoriaLogModel) => {
    abortDetalleRef.current?.abort();
    const controller = new AbortController();
    abortDetalleRef.current = controller;

    setDrawerOpen(true);
    setFallbackLog(log);
    setDetalle(null);
    setErrorDetalle(null);
    setCargandoDetalle(true);

    try {
      const data = await auditoriaService.obtenerDetalle(log.id, controller.signal, 'sistema');
      if (!controller.signal.aborted) setDetalle(data);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setErrorDetalle(
        err instanceof Error ? err.message : 'No se pudo cargar el detalle completo del evento',
      );
    } finally {
      if (!controller.signal.aborted) setCargandoDetalle(false);
    }
  };

  const cerrarDetalle = () => {
    abortDetalleRef.current?.abort();
    setDrawerOpen(false);
    setDetalle(null);
    setFallbackLog(null);
    setErrorDetalle(null);
  };

  const handleExportarCsv = async () => {
    if (exportando) return;
    setExportando(true);
    setError(null);
    try {
      await auditoriaService.exportarCsv({
        ...construirQuery(),
        impactoMin: filtros.impactoMin.trim() || undefined,
      });
      // Refrescar para mostrar el evento EXPORTAR_AUDITORIA recién registrado
      void cargar(meta.page, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar la auditoría en CSV');
    } finally {
      setExportando(false);
    }
  };

  const handleFiltrarAlerta = (alerta: AuditoriaAlertaModel) => {
    if (alerta.tipo === 'ANULACIONES_REPETIDAS_TURNO') {
      actualizarFiltros({
        usuarioId: alerta.usuarioId ? String(alerta.usuarioId) : '',
        cajaSesionId: alerta.cajaSesionId ? String(alerta.cajaSesionId) : '',
        accion: 'ANULACION_FACTURA',
        severidad: '',
      });
    } else {
      actualizarFiltros({
        aprobadorId: alerta.aprobadorId ? String(alerta.aprobadorId) : '',
        usuarioId: alerta.usuarioId ? String(alerta.usuarioId) : '',
        accion: '',
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Encabezado + Exportación CSV condicionada a auditoria:exportar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900">
            <ShieldCheck className="h-7 w-7 text-brand-700" aria-hidden="true" />
            Auditoría de sistema
          </h1>
        </div>

        {puedeExportar && (
          <button
            type="button"
            disabled={exportando}
            onClick={() => void handleExportarCsv()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-800 disabled:opacity-60"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            {exportando ? 'Exportando CSV…' : 'Exportar bitácora CSV'}
          </button>
        )}
      </div>

      {error && <Alert type="error" message={error} />}

      {/* 1. Resumen gerencial y alertas primero */}
      <AuditoriaResumen
        resumen={resumen}
        loading={loading}
        onFiltrarAlerta={handleFiltrarAlerta}
        onFiltrarUsuario={(usuarioId) => actualizarFiltros({ usuarioId: String(usuarioId) })}
        onFiltrarAprobador={(aprobadorId) =>
          actualizarFiltros({ aprobadorId: String(aprobadorId) })
        }
        onFiltrarSeveridad={(severidad: SeveridadAuditoria) =>
          actualizarFiltros({ severidad: filtros.severidad === severidad ? '' : severidad })
        }
      />

      <details className="rounded-2xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-slate-900">
          Filtros de la bitácora{hayFiltros ? ' (activos)' : ''}
        </summary>
        <div className="mt-3">
          <AuditoriaFiltros filtros={filtros} catalogo={catalogo} hayFiltros={hayFiltros}
            onChange={actualizarFiltros} onLimpiar={limpiarFiltros} />
        </div>
      </details>

      {/* 3. Tabla de eventos */}
      <AuditoriaTabla
        logs={logs}
        meta={meta}
        loading={loading}
        hayFiltros={hayFiltros}
        onPageChange={(p) => void cargar(p, false)}
        onSelectLog={(log) => void abrirDetalle(log)}
        onLimpiarFiltros={limpiarFiltros}
      />

      {/* 4. Drawer accesible de detalle */}
      <AuditoriaDetalleDrawer
        open={drawerOpen}
        loading={cargandoDetalle}
        error={errorDetalle}
        detalle={detalle}
        fallbackLog={fallbackLog}
        onClose={cerrarDetalle}
        onAbrirCorrelacionado={(rel) => void abrirDetalle(rel)}
      />
    </div>
  );
};
