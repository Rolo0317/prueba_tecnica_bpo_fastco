import { createHash, randomBytes } from 'node:crypto';
import type { Logger } from 'pino';
import { UnauthorizedError } from '../../core/errors.js';
import type { MailSender } from '../../core/mailer.js';
import type { UserRepository } from '../users/user.types.js';
import type { LoginResult, PasswordHasher, TokenService } from './auth.types.js';
import { passwordResetEmail } from './password-reset-email.js';

const INVALID_CREDENTIALS = 'Usuario o contraseña incorrectos.';
export const RESET_LINK_MINUTES = 30;

/** Solo se guarda el hash del token del enlace: una copia de la BD no sirve para usarlo. */
export const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface PasswordResetOptions {
  mailer: MailSender;
  logger: Logger;
  /** URL pública de la aplicación, para armar el enlace del correo. */
  publicUrl: string;
}

export class AuthService {
  /**
   * Hash de referencia para comparar cuando el usuario no existe: así la respuesta tarda
   * lo mismo en ambos casos y no se puede averiguar qué usuarios existen (timing attack).
   */
  private readonly dummyHash: Promise<string>;

  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly resets?: PasswordResetOptions,
  ) {
    this.dummyHash = passwordHasher.hash('dummy-password-for-constant-time');
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByUsername(username);
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const passwordMatches = await this.passwordHasher.verify(password, hash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    return this.issueSession(user.id);
  }

  /**
   * "¿Olvidaste tu contraseña?" (usuario o correo). Si la cuenta tiene correo, recibe un
   * enlace de un solo uso; si no, queda una solicitud para quien administra usuarios.
   * Siempre responde igual, exista o no la cuenta (no revela qué cuentas existen).
   */
  async requestPasswordReset(identifier: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_LINK_MINUTES * 60_000);
    const contact = await this.users.requestPasswordReset(
      identifier,
      hashResetToken(token),
      expiresAt,
    );
    if (!contact || !this.resets) return;

    const { mailer, logger, publicUrl } = this.resets;
    const link = `${publicUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    // Sin esperar el envío: la respuesta tarda lo mismo con o sin correo.
    mailer
      .send(
        passwordResetEmail({
          to: contact.email,
          fullName: contact.fullName,
          link,
          minutes: RESET_LINK_MINUTES,
        }),
      )
      .catch((error: unknown) => {
        logger.error({ err: error }, 'No se pudo enviar el correo de restablecimiento');
      });
  }

  /** Usa el enlace: asigna la contraseña nueva y cierra las sesiones abiertas de esa cuenta. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.users.consumePasswordReset(
      hashResetToken(token),
      await this.passwordHasher.hash(newPassword),
    );
  }

  /**
   * Nueva sesión para un usuario activo (al iniciar sesión o tras cambiar su propia
   * contraseña): devuelve el token y el usuario con su rol, área y permisos vigentes.
   */
  async issueSession(userId: number): Promise<LoginResult> {
    const session = await this.users.findSessionState(userId);
    if (!session) {
      throw new UnauthorizedError('Tu sesión ya no es válida. Inicia sesión de nuevo.');
    }
    const issued = this.tokens.issue(session.user, session.passwordVersion);
    return { ...issued, tokenType: 'Bearer', user: session.user };
  }
}
