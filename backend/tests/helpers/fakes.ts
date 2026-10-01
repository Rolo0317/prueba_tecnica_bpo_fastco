import { pino } from 'pino';
import { createApp } from '../../src/app.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/core/errors.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { PasswordHasher } from '../../src/modules/auth/auth.types.js';
import { JwtTokenService } from '../../src/modules/auth/token.service.js';
import { TaskService } from '../../src/modules/tasks/task.service.js';
import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Task,
  TaskPage,
  TaskRepository,
  TaskStatus,
} from '../../src/modules/tasks/task.types.js';
import type {
  CreateUserInput,
  User,
  UserRepository,
  UserWithCredentials,
} from '../../src/modules/users/user.types.js';

export const TEST_AUTH_CONFIG = {
  jwtSecret: 'test-secret-with-at-least-32-characters!!',
  jwtExpiresIn: '1h',
};

/** Hasher determinista y rápido para pruebas (bcrypt real es lento a propósito). */
export class FakePasswordHasher implements PasswordHasher {
  hash(plainText: string): Promise<string> {
    return Promise.resolve(`hashed:${plainText}`);
  }

  verify(plainText: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plainText}`);
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users: UserWithCredentials[] = [];

  findByUsername(username: string): Promise<UserWithCredentials | null> {
    const user = this.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    return Promise.resolve(user ?? null);
  }

  create(input: CreateUserInput): Promise<User> {
    if (this.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
      return Promise.reject(new ConflictError('El nombre de usuario ya existe.'));
    }
    const user = { id: this.users.length + 1, ...input };
    this.users.push(user);
    return Promise.resolve({ id: user.id, username: user.username, fullName: user.fullName });
  }
}

const STATUSES: TaskStatus[] = [
  { code: 'PENDING', name: 'Pendiente', isFinal: false, allowedTransitions: ['IN_PROGRESS', 'CANCELLED'] },
  { code: 'IN_PROGRESS', name: 'En progreso', isFinal: false, allowedTransitions: ['PENDING', 'COMPLETED', 'CANCELLED'] },
  { code: 'COMPLETED', name: 'Completada', isFinal: true, allowedTransitions: [] },
  { code: 'CANCELLED', name: 'Cancelada', isFinal: true, allowedTransitions: [] },
];

/** Reproduce las reglas de los Stored Procedures para probar la API sin SQL Server. */
export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks: Task[] = [];

  list({ status, page, pageSize }: ListTasksFilter): Promise<TaskPage> {
    if (status && !this.findStatus(status)) {
      return Promise.reject(new ValidationError('El estado indicado no existe.'));
    }
    const filtered = this.tasks
      .filter((task) => !status || task.status.code === status)
      .sort((a, b) => b.id - a.id);
    const start = (page - 1) * pageSize;
    return Promise.resolve({ tasks: filtered.slice(start, start + pageSize), total: filtered.length });
  }

  create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: this.tasks.length + 1,
      title: input.title,
      description: input.description,
      status: { code: 'PENDING', name: 'Pendiente' },
      priority: input.priority,
      dueDate: input.dueDate,
      createdBy: { id: input.createdBy, name: 'Usuario de prueba' },
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    return Promise.resolve(task);
  }

  changeStatus({ taskId, status }: ChangeTaskStatusInput): Promise<Task> {
    const target = this.findStatus(status);
    if (!target) return Promise.reject(new ValidationError('El estado indicado no existe.'));

    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return Promise.reject(new NotFoundError('La tarea no existe.'));

    const current = this.findStatus(task.status.code);
    if (!current?.allowedTransitions.includes(status)) {
      return Promise.reject(new ConflictError('No se permite ese cambio de estado.'));
    }

    task.status = { code: target.code, name: target.name };
    return Promise.resolve(task);
  }

  listStatuses(): Promise<TaskStatus[]> {
    return Promise.resolve(STATUSES);
  }

  private findStatus(code: string): TaskStatus | undefined {
    return STATUSES.find((s) => s.code === code);
  }
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  users: InMemoryUserRepository;
  tasks: InMemoryTaskRepository;
  tokenService: JwtTokenService;
  databaseUp: { value: boolean };
}

export const TEST_USER = { username: 'agente', password: 'Clave-Segura-123', fullName: 'Agente de Prueba' };

/** Arma la app real (rutas, middlewares, errores) con dependencias en memoria. */
export async function buildTestContext(): Promise<TestContext> {
  const users = new InMemoryUserRepository();
  const tasks = new InMemoryTaskRepository();
  const hasher = new FakePasswordHasher();
  const tokenService = new JwtTokenService(TEST_AUTH_CONFIG);
  const databaseUp = { value: true };

  await users.create({
    username: TEST_USER.username,
    passwordHash: await hasher.hash(TEST_USER.password),
    fullName: TEST_USER.fullName,
  });

  const app = createApp({
    config: { trustProxy: 0, corsOrigins: ['http://localhost:8080'] },
    logger: pino({ level: 'silent' }),
    authService: new AuthService(users, hasher, tokenService),
    taskService: new TaskService(tasks),
    tokenService,
    checkDatabase: () => (databaseUp.value ? Promise.resolve() : Promise.reject(new Error('down'))),
    loginRateLimit: { windowMs: 60_000, limit: 3 },
  });

  return { app, users, tasks, tokenService, databaseUp };
}

export function bearerFor(context: TestContext, userId = 1): string {
  const { token } = context.tokenService.issue({ id: userId, username: TEST_USER.username, fullName: TEST_USER.fullName });
  return `Bearer ${token}`;
}
