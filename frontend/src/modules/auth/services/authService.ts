import { http, type ApiClient } from '@/core/http';
import type { Credentials, LoginResponse } from '../types';

export interface AuthService {
  login(credentials: Credentials): Promise<LoginResponse>;
  /** "¿Olvidaste tu contraseña?": la atiende quien administra usuarios. */
  requestPasswordReset(username: string, captcha?: string): Promise<{ message: string }>;
  /** Usa el enlace del correo para asignar la contraseña nueva. */
  resetPassword(token: string, newPassword: string): Promise<void>;
}

export function createAuthService(client: ApiClient): AuthService {
  return {
    login: (credentials) => client.post<LoginResponse>('/auth/login', credentials),
    requestPasswordReset: (username, captcha) =>
      client.post<{ message: string }>('/auth/password-reset-requests', { username, captcha }),
    resetPassword: async (token, newPassword) => {
      await client.post<unknown>('/auth/password-resets', { token, newPassword });
    },
  };
}

export const authService = createAuthService(http);
