import { http, type ApiClient } from '@/core/http';
import type { LoginResponse } from '../types';

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export function createAccountService(client: ApiClient) {
  return {
    /** Devuelve una sesión nueva: la API invalida las anteriores al cambiar la contraseña. */
    changePassword: (payload: ChangePasswordPayload) =>
      client.put<LoginResponse>('/account/password', payload),
  };
}

export type AccountService = ReturnType<typeof createAccountService>;

export const accountService = createAccountService(http);
