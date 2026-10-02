import type { NamedRef } from '../access/access.types.js';
import type { SessionStore } from '../auth/auth.types.js';

/** Identidad básica de un usuario (lo que viaja en el JWT). */
export interface UserIdentity {
  id: number;
  username: string;
  fullName: string;
}

export interface UserWithCredentials extends UserIdentity {
  passwordHash: string;
  /** ISO; null = la contraseña inicial nunca se ha cambiado. */
  passwordChangedAt: string | null;
}

/** Usuario tal como lo ve el módulo de administración. */
export interface ManagedUser extends UserIdentity {
  role: NamedRef;
  area: NamedRef | null;
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
}

export interface UserPage {
  users: ManagedUser[];
  total: number;
}

export interface UserAssignment {
  roleId: number;
  /** null = sin área. */
  areaId: number | null;
}

export interface CreateUserInput extends UserAssignment {
  username: string;
  passwordHash: string;
  fullName: string;
  /** Quién crea el usuario; null = el sistema (seed del administrador inicial). */
  actorId: number | null;
}

export interface UpdateUserInput extends UserAssignment {
  userId: number;
  fullName: string;
  changedBy: number;
}

export interface SetUserActiveInput {
  userId: number;
  isActive: boolean;
  changedBy: number;
}

/** Usuario que puede ser responsable de una tarea. */
export interface AssignableUser extends UserIdentity {
  area: NamedRef | null;
}

export interface UserRepository extends SessionStore {
  findByUsername(username: string): Promise<UserWithCredentials | null>;
  findCredentialsById(userId: number): Promise<UserWithCredentials | null>;
  list(page: number, pageSize: number): Promise<UserPage>;
  create(input: CreateUserInput): Promise<ManagedUser>;
  update(input: UpdateUserInput): Promise<ManagedUser>;
  setActive(input: SetUserActiveInput): Promise<ManagedUser>;
  /** actorId: quién restablece la contraseña; null = el propio usuario. */
  updatePassword(userId: number, passwordHash: string, actorId: number | null): Promise<void>;
  /** Responsables que el actor puede elegir (todos o los de su área, según sus permisos). */
  listAssignable(actorId: number): Promise<AssignableUser[]>;
  /** Eliminación lógica; devuelve cuántas tareas abiertas quedaron sin asignar. */
  delete(userId: number, changedBy: number): Promise<number>;
}
