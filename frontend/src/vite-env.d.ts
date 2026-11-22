/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_CURRENCY_SYMBOL?: string;
  readonly VITE_CURRENCY_CODE?: string;
  readonly VITE_LOCALE?: string;
  readonly VITE_IVA_RATE?: string;
  readonly VITE_OZ_PER_LB?: string;
  readonly VITE_FACTURAS_PAGE_SIZE?: string;
  readonly VITE_DEFAULT_PAGE_SIZE?: string;
  readonly VITE_ADMIN_ROLE_CODE?: string;
  readonly VITE_AUTH_STORAGE_KEY?: string;
  readonly VITE_AUTO_PRINT_ENABLED?: string;
  readonly VITE_ENABLE_TABLE_SERVICE?: string;
  readonly VITE_DEFAULT_SERVICE_TYPE?: string;
  readonly VITE_SPECIAL_MENU_NOTICE_DAYS?: string;
  readonly VITE_SHOW_DEMO_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
