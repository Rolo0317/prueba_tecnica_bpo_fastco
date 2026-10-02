import type { RequestHandler } from 'express';
import { ValidationError } from '../core/errors.js';
import type { ProofOfWorkCaptcha } from '../modules/auth/captcha.service.js';

const MESSAGE = 'Confirma que no eres un robot.';

/** Exige un captcha resuelto en body.captcha. Con null (desactivado en .env) no hace nada. */
export function createCaptchaGuard(captcha: ProofOfWorkCaptcha | null): RequestHandler {
  return (req, _res, next) => {
    if (!captcha) {
      next();
      return;
    }
    const body: unknown = req.body;
    const encoded =
      typeof body === 'object' &&
      body !== null &&
      'captcha' in body &&
      typeof body.captcha === 'string'
        ? body.captcha
        : undefined;
    next(
      captcha.verify(encoded)
        ? undefined
        : new ValidationError(MESSAGE, [{ field: 'captcha', message: MESSAGE }]),
    );
  };
}
