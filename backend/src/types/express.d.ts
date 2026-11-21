// Extensión de tipos de Express para adjuntar el usuario autenticado y metadatos de cliente

export interface AuthenticatedUser {
  id: number;
  username: string;
  nombreCompleto: string;
  email: string;
  sucursalId: number;
  sucursalNombre: string;
  rolId: number;
  rolCodigo: string;
  rolNombre: string;
  vistaInicial: string;
  permisos: string[];
}

export interface ClientMeta {
  ipAddress: string;
  userAgent: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      clientMeta?: ClientMeta;
    }
  }
}

export {};
