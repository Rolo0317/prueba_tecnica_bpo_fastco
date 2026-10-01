import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../core/errors.js';
import { withValidation } from '../../middlewares/validate.js';
import type { AuthController } from './auth.controller.js';
import { loginSchemas } from './auth.schemas.js';

export interface LoginRateLimit {
  windowMs: number;
  limit: number;
}

export const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimit = { windowMs: 15 * 60 * 1000, limit: 10 };

export function createAuthRouter(
  controller: AuthController,
  loginRateLimit: LoginRateLimit = DEFAULT_LOGIN_RATE_LIMIT,
): Router {
  const router = Router();

  // Protección contra fuerza bruta: solo cuentan los intentos fallidos.
  const loginLimiter = rateLimit({
    ...loginRateLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError(429, 'TOO_MANY_REQUESTS', 'Demasiados intentos fallidos. Intenta más tarde.'),
      );
    },
  });

  router.post('/login', loginLimiter, withValidation(loginSchemas, controller.login));

  return router;
}
