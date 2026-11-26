import React, { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      language?: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

function cargarScriptTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Entorno sin ventana de navegador'));
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    if (existente) {
      existente.addEventListener('load', () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error('Turnstile no inicializó correctamente'));
      });
      existente.addEventListener('error', () => {
        turnstileScriptPromise = null;
        reject(new Error('No se pudo cargar la verificación de seguridad'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else {
        turnstileScriptPromise = null;
        reject(new Error('Turnstile no inicializó correctamente'));
      }
    };
    script.onerror = () => {
      turnstileScriptPromise = null;
      reject(new Error('No se pudo cargar la verificación de seguridad'));
    };
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

interface TurnstileWidgetProps {
  siteKey: string;
  resetKey: number;
  onTokenChange: (token: string | null) => void;
}

/**
 * Widget accesible de Cloudflare Turnstile.
 * - Solo carga el script externo cuando `siteKey` está configurado.
 * - Mantiene accesibilidad por teclado (el iframe nativo de Turnstile recibe foco)
 *   y anuncia cambios de estado mediante `aria-live="polite"`.
 */
export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  siteKey,
  resetKey,
  onTokenChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [estadoTexto, setEstadoTexto] = useState('Cargando verificación de seguridad...');
  const [errorCarga, setErrorCarga] = useState(false);

  onTokenChangeRef.current = onTokenChange;

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelado = false;

    setErrorCarga(false);
    setEstadoTexto('Cargando verificación de seguridad...');

    cargarScriptTurnstile()
      .then((turnstile) => {
        if (cancelado || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          language: 'es',
          callback: (token: string) => {
            if (cancelado) return;
            setEstadoTexto('Verificación de seguridad completada.');
            onTokenChangeRef.current(token);
          },
          'expired-callback': () => {
            if (cancelado) return;
            setEstadoTexto('La verificación expiró; complétala nuevamente.');
            onTokenChangeRef.current(null);
          },
          'error-callback': () => {
            if (cancelado) return;
            setEstadoTexto('Error en la verificación de seguridad; intenta de nuevo.');
            onTokenChangeRef.current(null);
          },
        });
        setEstadoTexto('Completa la verificación de seguridad para enviar tu pedido.');
      })
      .catch(() => {
        if (cancelado) return;
        setErrorCarga(true);
        setEstadoTexto('No se pudo cargar la verificación de seguridad.');
        onTokenChangeRef.current(null);
      });

    return () => {
      cancelado = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignora si el widget ya fue desmontado
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0) return;
    onTokenChangeRef.current(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
        setEstadoTexto('Completa nuevamente la verificación de seguridad.');
      } catch {
        // Ignora si el widget aún no está listo
      }
    }
  }, [resetKey]);

  if (!siteKey) return null;

  return (
    <div
      role="region"
      aria-label="Verificación de seguridad anti-bot"
      className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
    >
      <div ref={containerRef} className="min-h-[65px] overflow-x-auto" />
      <p
        aria-live="polite"
        className={`text-[11px] font-semibold ${errorCarga ? 'text-rose-700' : 'text-slate-600'}`}
      >
        {estadoTexto}
      </p>
    </div>
  );
};
