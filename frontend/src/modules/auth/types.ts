import type { NamedRef, Permission } from '@/modules/access/types';

/** Usuario autenticado: rol, área y permisos vigentes según la API. */
export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: NamedRef;
  area: NamedRef | null;
  permissions: Permission[];
}

export interface Credentials {
  username: string;
  password: string;
  /** Solución del captcha "No soy un robot" (undefined si está desactivado). */
  captcha?: string | undefined;
}

export interface LoginResponse {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export interface Session {
  token: string;
  /** Epoch en milisegundos. */
  expiresAt: number;
  user: AuthUser;
}
