import type { NamedRef, Permission } from '../access/access.types.js';
import type { UserIdentity } from '../users/user.types.js';

/**
 * Usuario autenticado que se adjunta a cada petición. Rol, área y permisos se leen de la
 * BD en cada petición (no viajan en el JWT), así un cambio aplica de inmediato.
 */
export interface AuthUser extends UserIdentity {
  role: NamedRef;
  area: NamedRef | null;
  permissions: Permission[];
}

export interface IssuedToken {
  token: string;
  expiresIn: number;
}

export interface LoginResult extends IssuedToken {
  tokenType: 'Bearer';
  user: AuthUser;
}

export interface PasswordHasher {
  hash(plainText: string): Promise<string>;
  verify(plainText: string, hash: string): Promise<boolean>;
}

/**
 * "Versión" de la contraseña: instante del último cambio (ms) o 0 si nunca cambió.
 * Viaja en el token; si la contraseña cambia, los tokens anteriores dejan de coincidir.
 */
export function passwordVersionOf(passwordChangedAt: string | null): number {
  return passwordChangedAt ? Date.parse(passwordChangedAt) : 0;
}

export interface VerifiedToken {
  userId: number;
  passwordVersion: number;
}

export interface TokenService {
  issue(user: UserIdentity, passwordVersion: number): IssuedToken;
  verify(token: string): VerifiedToken;
}

/** Estado vigente de un usuario en la BD, consultado en cada petición autenticada. */
export interface SessionState {
  user: AuthUser;
  passwordVersion: number;
}

export interface SessionStore {
  /** null = usuario inactivo o eliminado. */
  findSessionState(userId: number): Promise<SessionState | null>;
}
