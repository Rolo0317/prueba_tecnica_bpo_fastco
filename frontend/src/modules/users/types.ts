import type { NamedRef } from '@/modules/access/types';

export interface ManagedUser {
  id: number;
  username: string;
  fullName: string;
  role: NamedRef;
  /** null = sin área. */
  area: NamedRef | null;
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
}

export interface UserAssignment {
  roleId: number;
  areaId: number | null;
}

export interface NewUserPayload extends UserAssignment {
  username: string;
  fullName: string;
  password: string;
}

export interface UpdateUserPayload extends UserAssignment {
  fullName: string;
}
