import React from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Cuando cambia esta clave (p. ej. la ruta actual), se reinicia el estado de error automáticamente */
  resetKey?: string | number;
  /** Ocupa el alto completo de la pantalla (para el árbol raíz en main.tsx) */
  fullScreen?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Límite de error de React para aislar fallos inesperados de renderizado.
 * En desarrollo muestra el detalle técnico; en producción solo un mensaje amigable.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Error capturado en la interfaz:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const containerClass = this.props.fullScreen
      ? 'flex min-h-screen items-center justify-center bg-slate-100 p-4'
      : 'flex min-h-[60vh] items-center justify-center p-4';

    return (
      <div className={containerClass} role="alert">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-md sm:p-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-700">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                Ocurrió un problema inesperado
              </h2>
              <p className="text-sm text-slate-600">
                No pudimos mostrar esta sección correctamente. Puedes reintentar o volver al inicio.
              </p>
            </div>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <p className="font-bold">Detalle técnico (solo desarrollo):</p>
              <p className="mt-1 break-words font-mono">{this.state.error.message}</p>
              {this.state.error.stack && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-800">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={this.handleGoHome}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Ir al inicio
            </button>
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-bold text-white transition hover:bg-brand-800"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
