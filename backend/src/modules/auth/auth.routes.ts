import { Router } from 'express';
import { createCaptchaGuard } from '../../middlewares/captcha.js';
import {
  createFailedAttemptsLimiter,
  createRequestLimiter,
  DEFAULT_FAILED_ATTEMPTS_LIMIT,
  type FailedAttemptsLimit,
} from '../../middlewares/rate-limit.js';
import { withValidation } from '../../middlewares/validate.js';
import type { AuthController } from './auth.controller.js';
import { loginSchemas, passwordResetRequestSchemas, passwordResetSchemas } from './auth.schemas.js';
import type { ProofOfWorkCaptcha } from './captcha.service.js';

/** Solicitudes de restablecimiento: pocas por IP (no verifican contraseña, pero generan trabajo). */
const PASSWORD_RESET_LIMIT: FailedAttemptsLimit = { windowMs: 15 * 60 * 1000, limit: 5 };

export function createAuthRouter(
  controller: AuthController,
  captcha: ProofOfWorkCaptcha | null,
  limit: FailedAttemptsLimit = DEFAULT_FAILED_ATTEMPTS_LIMIT,
): Router {
  const router = Router();
  const requireCaptcha = createCaptchaGuard(captcha);

  router.get('/captcha', controller.captchaChallenge);
  // El limitador va primero: un captcha inválido también cuenta como intento fallido.
  router.post(
    '/login',
    createFailedAttemptsLimiter(limit),
    requireCaptcha,
    withValidation(loginSchemas, controller.login),
  );
  router.post(
    '/password-reset-requests',
    createRequestLimiter(PASSWORD_RESET_LIMIT),
    requireCaptcha,
    withValidation(passwordResetRequestSchemas, controller.requestPasswordReset),
  );
  // Usar el enlace: los tokens inválidos cuentan como intentos fallidos (frena la fuerza bruta).
  router.post(
    '/password-resets',
    createFailedAttemptsLimiter(limit),
    withValidation(passwordResetSchemas, controller.resetPassword),
  );

  return router;
}
