import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import { ConflictError } from './core/errors.js';
import type { AccessService } from './modules/access/access.service.js';
import type { PasswordHasher } from './modules/auth/auth.types.js';
import type { UserRepository } from './modules/users/user.types.js';

interface SeedDependencies {
  users: UserRepository;
  access: AccessService;
  passwordHasher: PasswordHasher;
  logger: Logger;
}

/** Administrador inicial (credenciales desde .env, contraseña con bcrypt). */
async function ensureAdminUser(seed: AppConfig['seed'], deps: SeedDependencies): Promise<void> {
  if (await deps.users.findByUsername(seed.adminUsername)) return;

  try {
    const user = await deps.users.create({
      username: seed.adminUsername,
      passwordHash: await deps.passwordHasher.hash(seed.adminPassword),
      fullName: seed.adminFullName,
      email: seed.adminEmail,
      roleId: await deps.access.findRoleIdByCode('ADMIN'),
      areaId: null,
      actorId: null,
    });
    deps.logger.info({ username: user.username }, 'Usuario inicial creado');
  } catch (error) {
    // Otra instancia lo creó al mismo tiempo: no es un error.
    if (!(error instanceof ConflictError)) throw error;
  }
}

/**
 * Las cuentas de demostración (db/scripts/08_demo_data.sql) se crean bloqueadas.
 * Si SEED_DEMO_PASSWORD está definida, se les asigna esa contraseña (una sola vez).
 */
async function activateDemoAccounts(seed: AppConfig['seed'], deps: SeedDependencies) {
  if (!seed.demoPassword) return;
  const activated = await deps.users.activateDemoAccounts(
    await deps.passwordHasher.hash(seed.demoPassword),
  );
  if (activated > 0) deps.logger.info({ activated }, 'Cuentas de demostración activadas');
}

/** Datos iniciales idempotentes. */
export async function seedInitialData(
  seed: AppConfig['seed'],
  deps: SeedDependencies,
): Promise<void> {
  await ensureAdminUser(seed, deps);
  await activateDemoAccounts(seed, deps);
}
