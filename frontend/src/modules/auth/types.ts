export type Role = 'ADMIN' | 'AGENT';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

export interface Credentials {
  username: string;
  password: string;
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
