import { createApiClient } from './apiClient';

type TokenProvider = () => string | null;
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider = () => null;
let unauthorizedHandler: UnauthorizedHandler = () => undefined;

/**
 * Inversión de dependencias: el cliente HTTP no conoce el módulo de autenticación;
 * main.ts le indica de dónde leer el token y qué hacer cuando la sesión expira.
 */
export function configureHttp(config: {
  getToken: TokenProvider;
  onUnauthorized: UnauthorizedHandler;
}): void {
  tokenProvider = config.getToken;
  unauthorizedHandler = config.onUnauthorized;
}

/** Base relativa: nginx (Docker) o el proxy de Vite (desarrollo) la redirigen a la API. */
export const http = createApiClient({
  baseUrl: '/api/v1',
  getToken: () => tokenProvider(),
  onUnauthorized: () => {
    unauthorizedHandler();
  },
});

export { ApiError, toApiError, type ApiErrorDetail } from './apiError';
export type { ApiClient, QueryParams } from './apiClient';
