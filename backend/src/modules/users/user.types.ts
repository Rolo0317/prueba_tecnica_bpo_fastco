import type { SessionStore } from '../auth/auth.types.js';

export const ROLES = ['ADMIN', 'AGENT'] as const;
export type Role = (typeof ROLES)[number];

/** Usuario autenticado (lo que viaja en el JWT). */
export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
}

export interface UserWithCredentials extends User {
  passwordHash: string;
  /** ISO; null = la contraseña inicial nunca se ha cambiado. */
  passwordChangedAt: string | null;
}

/** Usuario tal como lo ve el módulo de administración. */
export interface ManagedUser extends User {
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
}

export interface UserPage {
  users: ManagedUser[];
  total: number;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  fullName: string;
  role: Role;
}

export interface UpdateUserInput {
  userId: number;
  fullName: string;
  role: Role;
  changedBy: number;
}

export interface SetUserActiveInput {
  userId: number;
  isActive: boolean;
  changedBy: number;
}

/** Usuario que puede ser responsable de una tarea. */
export type AssignableUser = User;

export interface UserRepository extends SessionStore {
  findByUsername(username: string): Promise<UserWithCredentials | null>;
  findCredentialsById(userId: number): Promise<UserWithCredentials | null>;
  list(page: number, pageSize: number): Promise<UserPage>;
  create(input: CreateUserInput): Promise<ManagedUser>;
  update(input: UpdateUserInput): Promise<ManagedUser>;
  setActive(input: SetUserActiveInput): Promise<ManagedUser>;
  updatePassword(userId: number, passwordHash: string): Promise<void>;
  listAssignable(): Promise<AssignableUser[]>;
  /** Eliminación lógica; devuelve cuántas tareas abiertas quedaron sin asignar. */
  delete(userId: number, changedBy: number): Promise<number>;
}
