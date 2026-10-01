import { pino } from 'pino';
import { createApp } from '../../src/app.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../src/core/errors.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import {
  passwordVersionOf,
  type PasswordHasher,
  type SessionState,
} from '../../src/modules/auth/auth.types.js';
import { JwtTokenService } from '../../src/modules/auth/token.service.js';
import { TaskService } from '../../src/modules/tasks/task.service.js';
import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Task,
  TaskPage,
  TaskRepository,
  AddTaskNoteInput,
  TaskNote,
  TaskStatsSnapshot,
  TaskStatus,
  TimelineEvent,
  UpdateTaskInput,
  ViewerScope,
} from '../../src/modules/tasks/task.types.js';
import { UserService } from '../../src/modules/users/user.service.js';
import type {
  AssignableUser,
  CreateUserInput,
  ManagedUser,
  Role,
  SetUserActiveInput,
  UpdateUserInput,
  UserPage,
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

type StoredUser = ManagedUser & { passwordHash: string; deleted?: boolean };

/** Reproduce las reglas de 05_procedures_users.sql para probar la API sin SQL Server. */
export class InMemoryUserRepository implements UserRepository {
  readonly users: StoredUser[] = [];

  findByUsername(username: string): Promise<UserWithCredentials | null> {
    const user = this.users.find(
      (u) => u.isActive && u.username.toLowerCase() === username.toLowerCase(),
    );
    return Promise.resolve(user ? this.credentials(user) : null);
  }

  findCredentialsById(userId: number): Promise<UserWithCredentials | null> {
    const user = this.users.find((u) => u.isActive && u.id === userId);
    return Promise.resolve(user ? this.credentials(user) : null);
  }

  list(page: number, pageSize: number): Promise<UserPage> {
    const existing = this.users.filter((u) => !u.deleted);
    const start = (page - 1) * pageSize;
    const users = existing.slice(start, start + pageSize).map((u) => this.publicView(u));
    return Promise.resolve({ users, total: existing.length });
  }

  create(input: CreateUserInput): Promise<ManagedUser> {
    if (this.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
      return Promise.reject(new ConflictError('El nombre de usuario ya existe.'));
    }
    const user: StoredUser = {
      id: this.users.length + 1,
      ...input,
      isActive: true,
      createdAt: new Date().toISOString(),
      passwordChangedAt: null,
    };
    this.users.push(user);
    return Promise.resolve(this.publicView(user));
  }

  async update({ userId, fullName, role, changedBy }: UpdateUserInput): Promise<ManagedUser> {
    const user = await this.find(userId);
    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      if (userId === changedBy)
        throw new ConflictError('No puedes quitarte a ti mismo el rol de administrador.');
      this.assertAnotherActiveAdmin(userId);
    }
    Object.assign(user, { fullName, role });
    return this.publicView(user);
  }

  async setActive({ userId, isActive, changedBy }: SetUserActiveInput): Promise<ManagedUser> {
    const user = await this.find(userId);
    if (!isActive && userId === changedBy)
      throw new ConflictError('No puedes desactivar tu propio usuario.');
    if (!isActive && user.role === 'ADMIN') this.assertAnotherActiveAdmin(userId);
    user.isActive = isActive;
    return this.publicView(user);
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    const user = await this.find(userId);
    Object.assign(user, { passwordHash, passwordChangedAt: new Date().toISOString() });
  }

  listAssignable(): Promise<AssignableUser[]> {
    return Promise.resolve(
      this.users
        .filter((u) => u.isActive && !u.deleted)
        .map(({ id, username, fullName, role }) => ({ id, username, fullName, role })),
    );
  }

  async delete(userId: number, changedBy: number): Promise<number> {
    const user = await this.find(userId);
    if (userId === changedBy) throw new ConflictError('No puedes eliminar tu propio usuario.');
    if (user.role === 'ADMIN' && user.isActive) this.assertAnotherActiveAdmin(userId);
    Object.assign(user, { deleted: true, isActive: false });
    return 0;
  }

  private find(userId: number): Promise<StoredUser> {
    const user = this.users.find((u) => u.id === userId && !u.deleted);
    return user
      ? Promise.resolve(user)
      : Promise.reject(new NotFoundError('El usuario no existe.'));
  }

  private assertAnotherActiveAdmin(userId: number): void {
    if (!this.users.some((u) => u.role === 'ADMIN' && u.isActive && u.id !== userId)) {
      throw new ConflictError('Debe quedar al menos un administrador activo.');
    }
  }

  findSessionState(userId: number): Promise<SessionState | null> {
    const user = this.users.find((u) => u.id === userId && u.isActive && !u.deleted);
    return Promise.resolve(
      user ? { role: user.role, passwordVersion: passwordVersionOf(user.passwordChangedAt) } : null,
    );
  }

  private credentials({
    id,
    username,
    fullName,
    role,
    passwordHash,
    passwordChangedAt,
  }: StoredUser): UserWithCredentials {
    return { id, username, fullName, role, passwordHash, passwordChangedAt };
  }

  private publicView({ passwordHash: _hash, deleted: _deleted, ...user }: StoredUser): ManagedUser {
    return { ...user };
  }
}

const STATUSES: TaskStatus[] = [
  {
    code: 'PENDING',
    name: 'Pendiente',
    isFinal: false,
    allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
  },
  {
    code: 'IN_PROGRESS',
    name: 'En progreso',
    isFinal: false,
    allowedTransitions: ['PENDING', 'COMPLETED', 'CANCELLED'],
  },
  { code: 'COMPLETED', name: 'Completada', isFinal: true, allowedTransitions: [] },
  { code: 'CANCELLED', name: 'Cancelada', isFinal: true, allowedTransitions: [] },
];

/** Reproduce las reglas de los Stored Procedures para probar la API sin SQL Server. */
export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks: Task[] = [];
  readonly notes: (TaskNote & { taskId: number })[] = [];

  /** Mismo criterio que la BD: null = administrador; un id = asignadas o creadas por él. */
  private visibleTo(viewerId: ViewerScope | undefined): Task[] {
    if (viewerId === null || viewerId === undefined) return this.tasks;
    return this.tasks.filter((t) => t.assignedTo?.id === viewerId || t.createdBy.id === viewerId);
  }

  list({ status, page, pageSize, viewerId }: ListTasksFilter): Promise<TaskPage> {
    if (status && !this.findStatus(status)) {
      return Promise.reject(new ValidationError('El estado indicado no existe.'));
    }
    const filtered = this.visibleTo(viewerId)
      .filter((task) => !status || task.status.code === status)
      .sort((a, b) => b.id - a.id);
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      tasks: filtered.slice(start, start + pageSize),
      total: filtered.length,
    });
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
      createdBy: { id: input.createdBy, name: `Usuario ${input.createdBy}` },
      assignedTo:
        input.assignedTo === null
          ? null
          : { id: input.assignedTo, name: `Usuario ${input.assignedTo}` },
      notesCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    return Promise.resolve(task);
  }

  update({ taskId, assignedTo, actorId, ...data }: UpdateTaskInput): Promise<Task> {
    const task = this.visibleTo(actorId).find((t) => t.id === taskId);
    if (!task) return Promise.reject(new NotFoundError('La tarea no existe.'));
    if (actorId !== null && task.createdBy.id !== actorId) {
      return Promise.reject(new ForbiddenError('Solo puedes editar las tareas que creaste.'));
    }
    Object.assign(task, data);
    if (assignedTo !== undefined) {
      task.assignedTo =
        assignedTo === null ? null : { id: assignedTo, name: `Usuario ${assignedTo}` };
    }
    return Promise.resolve(task);
  }

  changeStatus({ taskId, status, viewerId }: ChangeTaskStatusInput): Promise<Task> {
    const target = this.findStatus(status);
    if (!target) return Promise.reject(new ValidationError('El estado indicado no existe.'));

    const task = this.visibleTo(viewerId).find((t) => t.id === taskId);
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

  addNote({ taskId, body, createdBy, viewerId }: AddTaskNoteInput): Promise<TaskNote> {
    const task = this.visibleTo(viewerId).find((t) => t.id === taskId);
    if (!task) return Promise.reject(new NotFoundError('La tarea no existe.'));
    const note = {
      taskId,
      id: this.notes.length + 1,
      body: body.trim(),
      author: { id: createdBy, name: `Usuario ${createdBy}` },
      createdAt: new Date().toISOString(),
    };
    this.notes.push(note);
    task.notesCount += 1;
    return Promise.resolve(note);
  }

  /** Versión simplificada: creación + avances (suficiente para probar la API). */
  timeline(taskId: number, viewerId: ViewerScope): Promise<TimelineEvent[]> {
    const task = this.visibleTo(viewerId).find((t) => t.id === taskId);
    if (!task) return Promise.reject(new NotFoundError('La tarea no existe.'));
    const created: TimelineEvent = {
      kind: 'CREATED',
      id: `CREATED-${String(task.id)}`,
      occurredAt: task.createdAt,
      actor: task.createdBy,
      status: { code: 'PENDING', name: 'Pendiente' },
    };
    const notes: TimelineEvent[] = this.notes
      .filter((n) => n.taskId === taskId)
      .map((n) => ({
        kind: 'NOTE',
        id: `NOTE-${String(n.id)}`,
        occurredAt: n.createdAt,
        actor: n.author,
        body: n.body,
      }));
    return Promise.resolve([created, ...notes]);
  }

  stats(today: string | null, viewerId?: ViewerScope): Promise<TaskStatsSnapshot> {
    const day = today ?? new Date().toISOString().slice(0, 10);
    const visible = this.visibleTo(viewerId);
    const open = visible.filter((t) => !this.findStatus(t.status.code)?.isFinal);
    return Promise.resolve({
      total: visible.length,
      overdue: open.filter((t) => t.dueDate !== null && t.dueDate < day).length,
      dueToday: open.filter((t) => t.dueDate === day).length,
      highPriorityOpen: open.filter((t) => t.priority === 'HIGH').length,
      byStatus: STATUSES.map(({ code, name, isFinal }) => ({
        code,
        name,
        isFinal,
        count: visible.filter((t) => t.status.code === code).length,
      })),
    });
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

export const TEST_USER = {
  username: 'admin',
  password: 'Clave-Segura-123',
  fullName: 'Admin de Prueba',
};
export const TEST_AGENT = {
  username: 'agente',
  password: 'Clave-Agente-123',
  fullName: 'Agente de Prueba',
};

/** Arma la app real (rutas, middlewares, errores) con dependencias en memoria. */
export async function buildTestContext(): Promise<TestContext> {
  const users = new InMemoryUserRepository();
  const tasks = new InMemoryTaskRepository();
  const hasher = new FakePasswordHasher();
  const tokenService = new JwtTokenService(TEST_AUTH_CONFIG);
  const databaseUp = { value: true };

  // id 1 = administrador, id 2 = agente
  for (const [user, role] of [
    [TEST_USER, 'ADMIN'],
    [TEST_AGENT, 'AGENT'],
  ] as const) {
    await users.create({
      username: user.username,
      passwordHash: await hasher.hash(user.password),
      fullName: user.fullName,
      role,
    });
  }

  const app = createApp({
    config: { trustProxy: 0, corsOrigins: ['http://localhost:8080'] },
    logger: pino({ level: 'silent' }),
    authService: new AuthService(users, hasher, tokenService),
    taskService: new TaskService(tasks),
    userService: new UserService(users, hasher),
    tokenService,
    sessionStore: users,
    checkDatabase: () => (databaseUp.value ? Promise.resolve() : Promise.reject(new Error('down'))),
    failedAttemptsLimit: { windowMs: 60_000, limit: 3 },
  });

  return { app, users, tasks, tokenService, databaseUp };
}

/** Token del administrador (id 1) por defecto, o del agente (id 2) con role 'AGENT'. */
/**
 * Token del administrador (id 1) por defecto, o del agente (id 2) con role 'AGENT'.
 * Lleva la versión de contraseña vigente en ese momento, como lo haría un login real.
 */
export function bearerFor(context: TestContext, role: Role = 'ADMIN'): string {
  const user = role === 'ADMIN' ? TEST_USER : TEST_AGENT;
  const id = role === 'ADMIN' ? 1 : 2;
  const stored = context.users.users.find((u) => u.id === id);
  const { token } = context.tokenService.issue(
    { id, username: user.username, fullName: user.fullName, role },
    passwordVersionOf(stored?.passwordChangedAt ?? null),
  );
  return `Bearer ${token}`;
}
