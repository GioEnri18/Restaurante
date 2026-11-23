// Lectura centralizada y tipada de TODAS las variables de entorno del frontend

function getEnvNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getEnvBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
}

function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/+$/, '');
  }
  if (import.meta.env.PROD) {
    // En producción no se permite caer a localhost; se alerta claramente en consola al arrancar
    console.error(
      '[POS] Configuración incompleta: falta la variable de entorno VITE_API_BASE_URL en producción. ' +
        'Defínela (ej. https://tu-api.onrender.com/api/v1) y vuelve a compilar el frontend.',
    );
    return '';
  }
  return 'http://localhost:4000/api/v1';
}

export const env = {
  API_BASE_URL: resolveApiBaseUrl(),
  API_TIMEOUT_MS: getEnvNumber(import.meta.env.VITE_API_TIMEOUT_MS, 15000),
  APP_NAME: import.meta.env.VITE_APP_NAME || 'POS Restaurante Guatemala',
  CURRENCY_SYMBOL: import.meta.env.VITE_CURRENCY_SYMBOL || 'Q',
  CURRENCY_CODE: import.meta.env.VITE_CURRENCY_CODE || 'GTQ',
  LOCALE: import.meta.env.VITE_LOCALE || 'es-GT',
  IVA_RATE: getEnvNumber(import.meta.env.VITE_IVA_RATE, 0.12),
  OZ_PER_LB: getEnvNumber(import.meta.env.VITE_OZ_PER_LB, 16),
  FACTURAS_PAGE_SIZE: getEnvNumber(import.meta.env.VITE_FACTURAS_PAGE_SIZE, 10),
  DEFAULT_PAGE_SIZE: getEnvNumber(import.meta.env.VITE_DEFAULT_PAGE_SIZE, 15),
  ADMIN_ROLE_CODE: import.meta.env.VITE_ADMIN_ROLE_CODE || 'ADMIN',
  AUTH_STORAGE_KEY: import.meta.env.VITE_AUTH_STORAGE_KEY || 'pos_restaurante_gt_session',
  CART_STORAGE_KEY: import.meta.env.VITE_CART_STORAGE_KEY || 'pos_cart_v1',
  AUTO_PRINT_ENABLED: getEnvBoolean(import.meta.env.VITE_AUTO_PRINT_ENABLED, true),
  ENABLE_TABLE_SERVICE: getEnvBoolean(import.meta.env.VITE_ENABLE_TABLE_SERVICE, false),
  DEFAULT_SERVICE_TYPE: (import.meta.env.VITE_DEFAULT_SERVICE_TYPE || 'MOSTRADOR') as
    | 'MOSTRADOR'
    | 'LLEVAR'
    | 'MESA'
    | 'DELIVERY',
  SPECIAL_MENU_NOTICE_DAYS: getEnvNumber(import.meta.env.VITE_SPECIAL_MENU_NOTICE_DAYS, 5),
  // Solo habilita botones de credenciales demo en entornos de prueba cuando se define explícitamente
  SHOW_DEMO_LOGIN: getEnvBoolean(import.meta.env.VITE_SHOW_DEMO_LOGIN, false),
} as const;
