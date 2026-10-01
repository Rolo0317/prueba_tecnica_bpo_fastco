import type { Role } from '@/modules/auth/types';

export type { Role };

export interface ManagedUser {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
}

export interface NewUserPayload {
  username: string;
  fullName: string;
  role: Role;
  password: string;
}

export interface UpdateUserPayload {
  fullName: string;
  role: Role;
}
