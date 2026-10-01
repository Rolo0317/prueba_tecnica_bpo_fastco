export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** Error normalizado de la API (mismo formato que devuelve el backend). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FALLBACK_MESSAGES: Readonly<Record<number, string>> = {
  0: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  401: 'Tu sesión expiró o dejó de ser válida. Inicia sesión de nuevo.',
  404: 'El recurso solicitado no existe.',
  408: 'El servidor tardó demasiado en responder. Intenta de nuevo.',
  429: 'Demasiados intentos. Espera un momento e intenta de nuevo.',
};

export const DEFAULT_ERROR_MESSAGE = 'Ocurrió un error inesperado. Intenta de nuevo.';

export function fallbackMessage(status: number): string {
  return FALLBACK_MESSAGES[status] ?? DEFAULT_ERROR_MESSAGE;
}

/** Convierte cualquier valor lanzado en un ApiError para que la UI lo trate de forma uniforme. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, 'UNKNOWN_ERROR', DEFAULT_ERROR_MESSAGE);
}
