import { ApiError, fallbackMessage, type ApiErrorDetail } from './apiError';

export type QueryParams = Record<string, string | number | null | undefined>;

export interface ApiClient {
  get<T>(path: string, query?: QueryParams): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  put<T = void>(path: string, body: unknown): Promise<T>;
  delete<T = void>(path: string): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[];
    meta?: Record<string, number>;
  };
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(baseUrl: string, path: string, query: QueryParams = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `${baseUrl}${path}${search ? `?${search}` : ''}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function toHttpError(response: Response): Promise<ApiError> {
  const body = (await readJson(response)) as ErrorBody | null;
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.code ?? `HTTP_${String(response.status)}`,
    error?.message ?? fallbackMessage(response.status),
    error?.details ?? [],
    error?.meta ?? {},
  );
}

/**
 * Único cliente HTTP de la aplicación: base URL, token Bearer, timeout,
 * normalización de errores y cierre de sesión ante un 401 con sesión activa.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchFn = options.fetchFn ?? fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(method: string, url: string, body?: unknown): Promise<Response> {
    const token = options.getToken();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      return await fetchFn(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      const status = timedOut ? 408 : 0;
      throw new ApiError(status, timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', fallbackMessage(status));
    }
  }

  async function request<T>(method: string, path: string, body?: unknown, query?: QueryParams) {
    const hadSession = options.getToken() !== null;
    const response = await send(method, buildUrl(options.baseUrl, path, query), body);

    if (!response.ok) {
      // Un 401 sin sesión es un login fallido, no una sesión expirada.
      if (response.status === 401 && hadSession) options.onUnauthorized();
      throw await toHttpError(response);
    }
    return (await readJson(response)) as T;
  }

  return {
    get: (path, query) => request('GET', path, undefined, query),
    post: (path, body) => request('POST', path, body),
    patch: (path, body) => request('PATCH', path, body),
    put: (path, body) => request('PUT', path, body),
    delete: (path) => request('DELETE', path),
  };
}
