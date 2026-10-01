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

    const authUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };
    return { ...this.tokens.issue(authUser), tokenType: 'Bearer', user: authUser };
  }
}
