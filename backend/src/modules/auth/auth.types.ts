import type { User } from '../users/user.types.js';

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

export interface TokenService {
  issue(user: AuthUser): IssuedToken;
  verify(token: string): AuthUser;
}
