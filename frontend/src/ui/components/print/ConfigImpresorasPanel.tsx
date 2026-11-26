import React, { useState } from 'react';
import { CheckCircle2, Printer, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import {
  ConfigImpresorasLocal,
  DestinoImpresoraConfig,
  ImpresoraWindowsInfo,
  printAgentService,
} from '../../../services/printAgent.service';
import { Alert } from '../common/Alert';

interface ConfigImpresorasPanelProps {
  agenteConectado: boolean;
  cargandoAgente: boolean;
  impresorasWindows: ImpresoraWindowsInfo[];
  config: ConfigImpresorasLocal;
  onChangeConfig: (next: ConfigImpresorasLocal) => void;
  onRecargarAgente: () => void;
}

interface SelectorDestinoProps {
  titulo: string;
  descripcion: string;
  etiquetaPrueba: 'CAJA' | 'COCINA';
  abrirGavetaEnPrueba: boolean;
  value: DestinoImpresoraConfig | null;
  impresorasWindows: ImpresoraWindowsInfo[];
  agenteConectado: boolean;
  onChange: (next: DestinoImpresoraConfig | null) => void;
}

const SelectorDestino: React.FC<SelectorDestinoProps> = ({
  titulo,
  descripcion,
  etiquetaPrueba,
  abrirGavetaEnPrueba,
  value,
  impresorasWindows,
  agenteConectado,
  onChange,
}) => {
  const modo = value?.tipo ?? 'windows';
  const [probando, setProbando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);

  const handleModoChange = (nuevoModo: 'windows' | 'tcp') => {
    setFeedback(null);
    if (nuevoModo === 'windows') {
      const primera = impresorasWindows[0]?.nombre ?? '';
      onChange(primera ? { tipo: 'windows', nombre: primera } : null);
    } else {
      onChange({
        tipo: 'tcp',
        host: value?.tipo === 'tcp' ? value.host : '192.168.1.50',
        port: value?.tipo === 'tcp' ? value.port : 9100,
      });
    }
  };

  const handleProbar = async () => {
    if (!value || !agenteConectado) return;
    setProbando(true);
    setFeedback(null);
    try {
      await printAgentService.probarImpresora({
        etiqueta: etiquetaPrueba,
        target: value,
        abrirGaveta: abrirGavetaEnPrueba,
      });
      setFeedback({ tipo: 'ok', texto: 'Ticket de prueba enviado correctamente.' });
    } catch (err) {
      setFeedback({
        tipo: 'err',
        texto: err instanceof Error ? err.message : 'Error al probar impresora.',
      });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold text-slate-900">{titulo}</p>
          <p className="text-[11px] text-slate-500">{descripcion}</p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => handleModoChange('windows')}
            className={`rounded-md px-2.5 py-1 transition ${
              modo === 'windows' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Puerto / Windows
          </button>
          <button
            type="button"
            onClick={() => handleModoChange('tcp')}
            className={`rounded-md px-2.5 py-1 transition ${
              modo === 'tcp' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Red local (IP)
          </button>
        </div>
      </div>

      {modo === 'windows' ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Seleccionar impresora de Windows para ${titulo}`}
            value={value?.tipo === 'windows' ? value.nombre : ''}
            onChange={(e) => {
              const nombre = e.target.value;
              onChange(nombre ? { tipo: 'windows', nombre } : null);
              setFeedback(null);
            }}
            className="min-h-[38px] flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800"
          >
            <option value="">-- Usar diálogo del navegador (sin asignar) --</option>
            {impresorasWindows.map((imp) => (
              <option key={imp.nombre} value={imp.nombre}>
                {imp.nombre}
                {imp.puerto ? ` (${imp.puerto})` : ''}
                {imp.predeterminada ? ' · Predeterminada' : ''}
              </option>
            ))}
            {value?.tipo === 'windows' &&
              !impresorasWindows.some((i) => i.nombre === value.nombre) && (
                <option value={value.nombre}>{value.nombre} (guardada)</option>
              )}
          </select>
          <button
            type="button"
            disabled={!agenteConectado || !value || probando}
            onClick={() => void handleProbar()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {probando ? 'Probando...' : 'Probar'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label={`Dirección IP para ${titulo}`}
            placeholder="Ej. 192.168.1.50"
            value={value?.tipo === 'tcp' ? value.host : ''}
            onChange={(e) => {
              const host = e.target.value;
              onChange(
                host.trim()
                  ? {
                      tipo: 'tcp',
                      host: host.trim(),
                      port: value?.tipo === 'tcp' ? value.port : 9100,
                    }
                  : null,
              );
              setFeedback(null);
            }}
            className="min-h-[38px] flex-1 rounded-lg border border-slate-300 px-2.5 font-mono text-xs font-semibold text-slate-900"
          />
          <input
            type="number"
            aria-label={`Puerto TCP para ${titulo}`}
            min={1}
            max={65535}
            value={value?.tipo === 'tcp' ? value.port : 9100}
            onChange={(e) => {
              const port = Number(e.target.value) || 9100;
              if (value?.tipo === 'tcp') {
                onChange({ tipo: 'tcp', host: value.host, port });
              }
            }}
            className="min-h-[38px] w-20 rounded-lg border border-slate-300 px-2 text-center font-mono text-xs font-semibold text-slate-900"
          />
          <button
            type="button"
            disabled={!agenteConectado || !value || probando}
            onClick={() => void handleProbar()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {probando ? 'Probando...' : 'Probar'}
          </button>
        </div>
      )}

      {feedback && (
        <p
          className={`mt-1.5 text-[11px] font-bold ${
            feedback.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'
          }`}
        >
          {feedback.texto}
        </p>
      )}
    </div>
  );
};

export const ConfigImpresorasPanel: React.FC<ConfigImpresorasPanelProps> = ({
  agenteConectado,
  cargandoAgente,
  impresorasWindows,
  config,
  onChangeConfig,
  onRecargarAgente,
}) => {
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {agenteConectado ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              Agente local conectado (se guarda automáticamente al elegir)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              Agente local no detectado en esta PC
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={cargandoAgente}
          onClick={onRecargarAgente}
          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${cargandoAgente ? 'animate-spin' : ''}`} aria-hidden="true" />
          Detectar impresoras
        </button>
      </div>

      {!agenteConectado && (
        <div className="mb-3">
          <Alert
            type="warning"
            message="Para imprimir directo a cada impresora sin abrir la ventana del navegador, ejecuta print-agent/iniciar-impresoras.bat (o instalar-inicio-windows.bat) en la PC de caja y pulsa «Detectar impresoras»."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SelectorDestino
          titulo="Impresora de Caja (Factura x2 + Gaveta)"
          descripcion="Imprime 2 copias de la factura con corte y abre la caja registradora."
          etiquetaPrueba="CAJA"
          abrirGavetaEnPrueba
          value={config.caja}
          impresorasWindows={impresorasWindows}
          agenteConectado={agenteConectado}
          onChange={(caja) => onChangeConfig({ ...config, caja })}
        />

        <SelectorDestino
          titulo="Impresora de Cocina (Comanda)"
          descripcion="Imprime únicamente 1 comanda de cocina con corte (no abre gaveta)."
          etiquetaPrueba="COCINA"
          abrirGavetaEnPrueba={false}
          value={config.cocina}
          impresorasWindows={impresorasWindows}
          agenteConectado={agenteConectado}
          onChange={(cocina) => onChangeConfig({ ...config, cocina })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
        <label className="inline-flex cursor-pointer items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={config.abrirGavetaSoloEfectivo}
            onChange={(e) =>
              onChangeConfig({ ...config, abrirGavetaSoloEfectivo: e.target.checked })
            }
            className="h-4 w-4 rounded border-slate-300 text-brand-700"
          />
          Abrir la caja registradora únicamente cuando el pago sea en EFECTIVO
        </label>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Guardado automático en esta computadora
        </span>
      </div>
    </div>
  );
};
