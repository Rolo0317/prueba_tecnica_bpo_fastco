import { http, type ApiClient } from '@/core/http';
import type { Credentials, LoginResponse } from '../types';

export interface AuthService {
  login(credentials: Credentials): Promise<LoginResponse>;
}

export function createAuthService(client: ApiClient): AuthService {
  return {
    login: (credentials) => client.post<LoginResponse>('/auth/login', credentials),
  };
}

export const authService = createAuthService(http);
