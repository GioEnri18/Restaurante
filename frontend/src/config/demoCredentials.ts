// Credenciales de prueba rápida utilizadas únicamente en desarrollo local
// o cuando VITE_SHOW_DEMO_LOGIN=true. En builds de producción normales este
// módulo se elimina por completo mediante tree-shaking.

export interface CredencialDemo {
  etiqueta: string;
  usuario: string;
  clave: string;
}

export const CREDENCIALES_DEMO: readonly CredencialDemo[] = [
  { etiqueta: 'Admin', usuario: 'admin', clave: 'Admin123!' },
  { etiqueta: 'Cajero', usuario: 'cajero', clave: 'Cajero123!' },
  { etiqueta: 'Mesero', usuario: 'mesero', clave: 'Mesero123!' },
] as const;
