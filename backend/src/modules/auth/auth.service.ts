import { UnauthorizedError } from '../../core/errors.js';
import type { UserRepository } from '../users/user.types.js';
import type { UserWithCredentials } from '../users/user.types.js';
import {
  passwordVersionOf,
  type LoginResult,
  type PasswordHasher,
  type TokenService,
} from './auth.types.js';

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

    return this.startSession(user);
  }

  /** Nueva sesión para un usuario activo (p. ej. tras cambiar su propia contraseña). */
  async issueSession(userId: number): Promise<LoginResult> {
    const user = await this.users.findCredentialsById(userId);
    if (!user) {
      throw new UnauthorizedError('Tu sesión ya no es válida. Inicia sesión de nuevo.');
    }
    return this.startSession(user);
  }

  private startSession(user: UserWithCredentials): LoginResult {
    const authUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
    const issued = this.tokens.issue(authUser, passwordVersionOf(user.passwordChangedAt));
    return { ...issued, tokenType: 'Bearer', user: authUser };
  }
}
