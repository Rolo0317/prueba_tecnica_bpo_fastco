import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../../core/errors.js';
import { attemptsRemaining } from '../../middlewares/rate-limit.js';
import type { ValidatedHandler } from '../../middlewares/validate.js';
import type {
  loginSchemas,
  passwordResetRequestSchemas,
  passwordResetSchemas,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import type { ProofOfWorkCaptcha } from './captcha.service.js';

export const PASSWORD_RESET_MESSAGE =
  'Si la cuenta existe, te enviamos un enlace a tu correo para crear una contraseña nueva. Si no tiene correo registrado, el equipo de administración recibirá tu solicitud.';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly captcha: ProofOfWorkCaptcha | null,
  ) {}

  /** Desafío del captcha; enabled = false si está desactivado en el entorno. */
  captchaChallenge: RequestHandler = (_req, res) => {
    res
      .status(200)
      .json(this.captcha ? { enabled: true, ...this.captcha.create() } : { enabled: false });
  };

  login: ValidatedHandler<typeof loginSchemas> = async ({ body }, req, res) => {
    try {
      res.status(200).json(await this.authService.login(body.username, body.password));
    } catch (error) {
      // Credenciales incorrectas: se informa cuántos intentos quedan antes del bloqueo.
      const remaining = attemptsRemaining(req);
      if (error instanceof UnauthorizedError && remaining !== null) {
        throw new UnauthorizedError(error.message, { attemptsRemaining: remaining });
      }
      throw error;
    }
  };

  requestPasswordReset: ValidatedHandler<typeof passwordResetRequestSchemas> = async (
    { body },
    _req,
    res,
  ) => {
    await this.authService.requestPasswordReset(body.username);
    res.status(202).json({ message: PASSWORD_RESET_MESSAGE });
  };

  resetPassword: ValidatedHandler<typeof passwordResetSchemas> = async ({ body }, _req, res) => {
    await this.authService.resetPassword(body.token, body.newPassword);
    res.status(204).end();
  };
}
