import type { TicketImprimibleModel } from '../models';

export interface ImpresoraWindowsInfo {
  nombre: string;
  puerto: string;
  predeterminada: boolean;
  enRed: boolean;
}

export type DestinoImpresoraConfig =
  | { tipo: 'windows'; nombre: string }
  | { tipo: 'tcp'; host: string; port: number };

export interface ConfigImpresorasLocal {
  caja: DestinoImpresoraConfig | null;
  cocina: DestinoImpresoraConfig | null;
  /** true = abre caja registradora solo en EFECTIVO; false = abre en toda venta */
  abrirGavetaSoloEfectivo: boolean;
}

const STORAGE_KEY = 'pos_gt_impresoras_v1';
const AGENT_BASE_URL = (
  import.meta.env.VITE_PRINT_AGENT_URL?.trim() || 'http://127.0.0.1:9180'
).replace(/\/+$/, '');

const DEFAULT_CONFIG: ConfigImpresorasLocal = {
  caja: null,
  cocina: null,
  abrirGavetaSoloEfectivo: true,
};

function normalizarDestino(raw: unknown): DestinoImpresoraConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.tipo === 'windows' && typeof obj.nombre === 'string' && obj.nombre.trim()) {
    return { tipo: 'windows', nombre: obj.nombre.trim() };
  }
  if (obj.tipo === 'tcp' && typeof obj.host === 'string' && obj.host.trim()) {
    const portNum = Number(obj.port ?? 9100);
    return {
      tipo: 'tcp',
      host: obj.host.trim(),
      port: Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535 ? portNum : 9100,
    };
  }
  return null;
}

export function leerConfigImpresoras(): ConfigImpresorasLocal {
  if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      caja: normalizarDestino(parsed.caja),
      cocina: normalizarDestino(parsed.cocina),
      abrirGavetaSoloEfectivo:
        typeof parsed.abrirGavetaSoloEfectivo === 'boolean'
          ? parsed.abrirGavetaSoloEfectivo
          : true,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function guardarConfigImpresoras(config: ConfigImpresorasLocal): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignorar error de cuota de almacenamiento local
  }
}

export function describirDestinoImpresora(target: DestinoImpresoraConfig | null): string {
  if (!target) return 'Sin asignar (usa ventana del navegador)';
  if (target.tipo === 'windows') return target.nombre;
  return `Red ${target.host}:${target.port}`;
}

async function fetchConTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 1500,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export const printAgentService = {
  async verificarEstado(): Promise<boolean> {
    try {
      const res = await fetchConTimeout(`${AGENT_BASE_URL}/health`, { method: 'GET' }, 1200);
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean };
      return Boolean(data.ok);
    } catch {
      return false;
    }
  },

  async listarImpresoras(): Promise<ImpresoraWindowsInfo[]> {
    const res = await fetchConTimeout(`${AGENT_BASE_URL}/printers`, { method: 'GET' }, 5000);
    if (!res.ok) {
      throw new Error('No se pudo obtener la lista de impresoras de Windows.');
    }
    const data = (await res.json()) as { printers?: ImpresoraWindowsInfo[] };
    return Array.isArray(data.printers) ? data.printers : [];
  },

  async imprimirTicket(params: {
    destino: 'CAJA' | 'COCINA' | 'ENTREGA';
    target: DestinoImpresoraConfig;
    ticket: TicketImprimibleModel;
    opciones?: {
      copias?: number;
      abrirGaveta?: boolean;
      esReimpresion?: boolean;
    };
  }): Promise<void> {
    const res = await fetchConTimeout(
      `${AGENT_BASE_URL}/print`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      12_000,
    );
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'La ticketera devolvió un error al imprimir.');
    }
  },

  async probarImpresora(params: {
    etiqueta: 'CAJA' | 'COCINA';
    target: DestinoImpresoraConfig;
    abrirGaveta: boolean;
  }): Promise<void> {
    const res = await fetchConTimeout(
      `${AGENT_BASE_URL}/print`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destino: 'PRUEBA',
          target: params.target,
          opciones: {
            etiqueta: params.etiqueta,
            abrirGaveta: params.abrirGaveta,
          },
        }),
      },
      12_000,
    );
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.message || 'No se pudo enviar el ticket de prueba.');
    }
  },
};
