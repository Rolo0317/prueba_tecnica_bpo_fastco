import type { Role, User } from '../users/user.types.js';

/** Usuario autenticado que viaja en el JWT y se adjunta a cada petición. */
export type AuthUser = User;

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
  user: AuthUser;
  passwordVersion: number;
}

export interface TokenService {
  issue(user: AuthUser, passwordVersion: number): IssuedToken;
  verify(token: string): VerifiedToken;
}

/** Estado vigente de un usuario en la BD, consultado en cada petición autenticada. */
export interface SessionState {
  role: Role;
  passwordVersion: number;
}

export interface SessionStore {
  /** null = usuario inactivo o eliminado. */
  findSessionState(userId: number): Promise<SessionState | null>;
}
