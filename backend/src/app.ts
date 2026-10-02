import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env.js';
import { createAuthenticate } from './middlewares/authenticate.js';
import { createErrorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { AccessController } from './modules/access/access.controller.js';
import {
  createAreaRouter,
  createPermissionRouter,
  createRoleRouter,
} from './modules/access/access.routes.js';
import type { AccessService } from './modules/access/access.service.js';
import { AuthController } from './modules/auth/auth.controller.js';
import type { FailedAttemptsLimit } from './middlewares/rate-limit.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';
import type { SessionStore, TokenService } from './modules/auth/auth.types.js';
import type { ProofOfWorkCaptcha } from './modules/auth/captcha.service.js';
import { createHealthRouter, type HealthCheck } from './modules/health/health.routes.js';
import { TaskController } from './modules/tasks/task.controller.js';
import { createTaskRouter, createTaskStatusRouter } from './modules/tasks/task.routes.js';
import type { TaskService } from './modules/tasks/task.service.js';
import { UserController } from './modules/users/user.controller.js';
import { createAccountRouter, createUserRouter } from './modules/users/user.routes.js';
import type { UserService } from './modules/users/user.service.js';

export interface AppDependencies {
  config: Pick<AppConfig, 'trustProxy' | 'corsOrigins'>;
  logger: Logger;
  authService: AuthService;
  taskService: TaskService;
  userService: UserService;
  accessService: AccessService;
  tokenService: TokenService;
  sessionStore: SessionStore;
  /** null = captcha desactivado (AUTH_CAPTCHA=false). */
  captcha: ProofOfWorkCaptcha | null;
  checkDatabase: HealthCheck;
  failedAttemptsLimit?: FailedAttemptsLimit;
}

function createApiRouter(deps: AppDependencies): Router {
  const authenticate = createAuthenticate(deps.tokenService, deps.sessionStore);
  const taskController = new TaskController(deps.taskService);
  const userController = new UserController(deps.userService, (userId) =>
    deps.authService.issueSession(userId),
  );
  const accessController = new AccessController(deps.accessService);
  const api = Router();

  api.use(
    '/auth',
    createAuthRouter(
      new AuthController(deps.authService, deps.captcha),
      deps.captcha,
      deps.failedAttemptsLimit,
    ),
  );
  api.use('/tasks', authenticate, createTaskRouter(taskController));
  api.use('/task-statuses', authenticate, createTaskStatusRouter(taskController));
  api.use('/users', authenticate, createUserRouter(userController));
  api.use('/roles', authenticate, createRoleRouter(accessController));
  api.use('/permissions', authenticate, createPermissionRouter(accessController));
  api.use('/areas', authenticate, createAreaRouter(accessController));
  api.use('/account', authenticate, createAccountRouter(userController, deps.failedAttemptsLimit));

  return api;
}

/** Construye la aplicación sin abrir el puerto, para poder probarla con supertest. */
export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: deps.config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(
    pinoHttp({ logger: deps.logger, autoLogging: { ignore: (req) => req.url === '/health' } }),
  );

  app.use('/health', createHealthRouter(deps.checkDatabase));
  app.use('/api/v1', createApiRouter(deps));

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));

  return app;
}
