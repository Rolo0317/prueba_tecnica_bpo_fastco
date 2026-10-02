import type { NamedRef } from '@/modules/access/types';

export interface ManagedUser {
  id: number;
  username: string;
  fullName: string;
  /** Correo para restablecer la contraseña por enlace; null = sin correo. */
  email: string | null;
  role: NamedRef;
  /** null = sin área. */
  area: NamedRef | null;
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
  /** Solicitud de "¿Olvidaste tu contraseña?" pendiente (cuenta sin correo). */
  passwordResetRequestedAt: string | null;
}

export type UserStatusFilter = 'ACTIVE' | 'INACTIVE';

/** Filtros del listado de usuarios (null = sin filtrar). */
export interface UserFilters {
  search: string;
  roleId: number | null;
  areaId: number | null;
  status: UserStatusFilter | null;
  pendingReset: boolean;
}

export interface UserAssignment {
  roleId: number;
  areaId: number | null;
}

export interface NewUserPayload extends UserAssignment {
  username: string;
  fullName: string;
  email: string | null;
  password: string;
}

export interface UpdateUserPayload extends UserAssignment {
  fullName: string;
  email: string | null;
}
