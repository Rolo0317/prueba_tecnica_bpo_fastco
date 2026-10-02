import { http, type ApiClient } from '@/core/http';
import type { AuthUser, LoginResponse } from '../types';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function createAccountService(client: ApiClient) {
  return {
    /** Usuario autenticado con su rol, área y permisos vigentes. */
    me: () => client.get<AuthUser>('/account/me'),
    /** Devuelve una sesión nueva: la API invalida las anteriores al cambiar la contraseña. */
    changePassword: (payload: ChangePasswordPayload) =>
      client.put<LoginResponse>('/account/password', payload),
  };
}

export type AccountService = ReturnType<typeof createAccountService>;

export const accountService = createAccountService(http);
