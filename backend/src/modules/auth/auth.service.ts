import { UnauthorizedError } from '../../core/errors.js';
import type { UserRepository } from '../users/user.types.js';
import type { LoginResult, PasswordHasher, TokenService } from './auth.types.js';

const INVALID_CREDENTIALS = 'Usuario o contraseña incorrectos.';

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
