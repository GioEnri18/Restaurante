import { env } from '../config/env';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, status = 500, code = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function mensajeErrorFormulario(error: unknown, alternativo: string): string {
  if (error instanceof ApiError && Array.isArray(error.details)) {
    const mensajes = error.details.flatMap((detalle) =>
      detalle && typeof detalle.mensaje === 'string' ? [detalle.mensaje] : []);
    if (mensajes.length) return mensajes.join(' · ');
  }
  return error instanceof Error ? error.message : alternativo;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      sp.set(key, String(val));
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Cliente HTTP con autenticación mediante cookie `httpOnly` (`credentials: 'include'`)
 * y encabezado personalizado `X-Requested-With: XMLHttpRequest` para protección CSRF (Fase 2.7).
 * Soporta cancelación externa vía AbortSignal combinada con el timeout configurado.
 */
async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<ApiEnvelope<T>> {
  const externalSignal = options.signal;
  if (externalSignal?.aborted) {
    throw new DOMException('Solicitud cancelada', 'AbortError');
  }

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => {
    controller.abort();
  };
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, env.API_TIMEOUT_MS);

  try {
    const formData = options.body instanceof FormData ? options.body : null;
    const headers: Record<string, string> = {
      ...(!formData && { 'Content-Type': 'application/json' }),
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers,
    };

    const res = await fetch(`${env.API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: controller.signal,
    });

    const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

    if (!res.ok || !json || !json.ok) {
      // Si la sesión expiró fuera de login/me, notificar al store para limpiar estado en memoria
      if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/me')) {
        window.dispatchEvent(new CustomEvent('pos:unauthorized'));
      }

      throw new ApiError(
        json?.error?.message || `Error HTTP ${res.status}`,
        res.status,
        json?.error?.code || 'HTTP_ERROR',
        json?.error?.details,
      );
    }

    return json;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isAbortError(err)) {
      if (externalSignal?.aborted && !timedOut) {
        throw err;
      }
      throw new ApiError('Tiempo de espera agotado al conectar con el servidor', 408, 'TIMEOUT');
    }
    throw new ApiError('No se pudo conectar con la API del servidor', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  if (!res.ok) {
    throw new ApiError('No fue posible exportar el archivo solicitado', res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const httpClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'GET', signal: options?.signal }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'POST', body, signal: options?.signal }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PUT', body, signal: options?.signal }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { method: 'PATCH', body, signal: options?.signal }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { method: 'DELETE', signal: options?.signal }),
  downloadFile,
};
