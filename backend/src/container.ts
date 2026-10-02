import { createHmac } from 'node:crypto';
import type { Logger } from 'pino';
import type { AppConfig } from './config/env.js';
import { DisabledMailSender, SmtpMailSender } from './core/mailer.js';
import type { ProcedureRunner } from './database/procedure-executor.js';
import { SqlAccessRepository } from './modules/access/access.repository.js';
import { AccessService } from './modules/access/access.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import type { PasswordHasher, SessionStore, TokenService } from './modules/auth/auth.types.js';
import { BcryptPasswordHasher } from './modules/auth/password-hasher.js';
import { ProofOfWorkCaptcha } from './modules/auth/captcha.service.js';
import { JwtTokenService } from './modules/auth/token.service.js';
import { SqlTaskRepository } from './modules/tasks/task.repository.js';
import { TaskService } from './modules/tasks/task.service.js';
import type { TaskRepository } from './modules/tasks/task.types.js';
import { SqlUserRepository } from './modules/users/user.repository.js';
import { UserService } from './modules/users/user.service.js';
import type { UserRepository } from './modules/users/user.types.js';

export interface Container {
  userRepository: UserRepository;
  taskRepository: TaskRepository;
  passwordHasher: PasswordHasher;
  tokenService: TokenService;
  sessionStore: SessionStore;
  captcha: ProofOfWorkCaptcha | null;
  authService: AuthService;
  taskService: TaskService;
  userService: UserService;
  accessService: AccessService;
}

/** Composition root: el único lugar donde se eligen las implementaciones concretas. */
export function createContainer(config: AppConfig, db: ProcedureRunner, logger: Logger): Container {
  const userRepository = new SqlUserRepository(db);
  const taskRepository = new SqlTaskRepository(db);
  const passwordHasher = new BcryptPasswordHasher(config.auth.bcryptSaltRounds);
  const tokenService = new JwtTokenService(config.auth);

  return {
    userRepository,
    taskRepository,
    passwordHasher,
    tokenService,
    sessionStore: userRepository,
    // Clave del captcha derivada del secreto JWT: sin otra variable de entorno que administrar.
    captcha: config.auth.captcha
      ? new ProofOfWorkCaptcha(
          createHmac('sha256', config.auth.jwtSecret).update('captcha').digest('hex'),
        )
      : null,
    authService: new AuthService(userRepository, passwordHasher, tokenService, {
      mailer: config.mail.smtp
        ? new SmtpMailSender(config.mail.smtp)
        : new DisabledMailSender(logger),
      logger,
      publicUrl: config.mail.publicUrl,
    }),
    taskService: new TaskService(taskRepository),
    userService: new UserService(userRepository, passwordHasher),
    accessService: new AccessService(new SqlAccessRepository(db)),
  };
}
