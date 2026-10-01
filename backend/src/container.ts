import type { AppConfig } from './config/env.js';
import type { ProcedureRunner } from './database/procedure-executor.js';
import { AuthService } from './modules/auth/auth.service.js';
import type { PasswordHasher, SessionStore, TokenService } from './modules/auth/auth.types.js';
import { BcryptPasswordHasher } from './modules/auth/password-hasher.js';
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
  authService: AuthService;
  taskService: TaskService;
  userService: UserService;
}

/** Composition root: el único lugar donde se eligen las implementaciones concretas. */
export function createContainer(config: AppConfig, db: ProcedureRunner): Container {
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
    authService: new AuthService(userRepository, passwordHasher, tokenService),
    taskService: new TaskService(taskRepository),
    userService: new UserService(userRepository, passwordHasher),
  };
}
