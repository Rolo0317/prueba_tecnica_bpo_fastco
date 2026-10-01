import type { RequestHandler } from 'express';
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
    handler: (_req, _res, next) => {
      next(
        new AppError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos fallidos. Intenta más tarde.'),
      );
    },
  });
}
