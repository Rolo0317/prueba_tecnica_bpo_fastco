import type { Request, RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../core/errors.js';

export interface FailedAttemptsLimit {
  windowMs: number;
  limit: number;
}

export const DEFAULT_FAILED_ATTEMPTS_LIMIT: FailedAttemptsLimit = {
  windowMs: 15 * 60 * 1000,
  limit: 10,
};

interface LimitInfo {
  remaining: number;
  resetTime?: Date | undefined;
}

const isLimitInfo = (value: unknown): value is LimitInfo =>
  typeof value === 'object' && value !== null && 'remaining' in value;

/** Estado del límite para esta petición (lo deja express-rate-limit en req.rateLimit). */
function limitInfo(req: Request): LimitInfo | null {
  const info: unknown = (req as Request & { rateLimit?: unknown }).rateLimit;
  return isLimitInfo(info) ? info : null;
}

/** Intentos fallidos que le quedan al cliente antes del bloqueo (null = sin límite aplicado). */
export function attemptsRemaining(req: Request): number | null {
  return limitInfo(req)?.remaining ?? null;
}

function tooManyAttempts(req: Request): AppError {
  const resetTime = limitInfo(req)?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : undefined;
  return new AppError(
    429,
    'TOO_MANY_REQUESTS',
    'Demasiados intentos fallidos. Intenta más tarde.',
    undefined,
    retryAfterSeconds === undefined ? undefined : { retryAfterSeconds },
  );
}

/**
 * Protección contra fuerza bruta en endpoints que verifican una contraseña
 * (login y cambio de contraseña): solo cuentan los intentos fallidos.
 */
export function createFailedAttemptsLimiter(
  options: FailedAttemptsLimit = DEFAULT_FAILED_ATTEMPTS_LIMIT,
): RequestHandler {
  return rateLimit({
    ...options,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      next(tooManyAttempts(req));
    },
  });
}

/** Límite simple por IP para endpoints públicos que no verifican contraseña (cuenta todo). */
export function createRequestLimiter(options: FailedAttemptsLimit): RequestHandler {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      next(tooManyAttempts(req));
    },
  });
}
