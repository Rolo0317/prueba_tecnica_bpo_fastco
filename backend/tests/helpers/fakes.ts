import { pino } from 'pino';
import { createApp } from '../../src/app.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../src/core/errors.js';
import { AccessService } from '../../src/modules/access/access.service.js';
import {
  PERMISSIONS,
  type AccessRepository,
  type Area,
  type AreaInput,
  type NamedRef,
  type Permission,
  type PermissionInfo,
  type Role,
  type RoleInput,
} from '../../src/modules/access/access.types.js';
import type { MailMessage, MailSender } from '../../src/core/mailer.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { ProofOfWorkCaptcha } from '../../src/modules/auth/captcha.service.js';
import {
  passwordVersionOf,
  type AuthUser,
  type PasswordHasher,
  type SessionState,
} from '../../src/modules/auth/auth.types.js';
import { JwtTokenService } from '../../src/modules/auth/token.service.js';
import { TaskService } from '../../src/modules/tasks/task.service.js';
import type {
  AddTaskNoteInput,
  AreaPerformance,
  AreaPerformanceFilter,
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Task,
  TaskNote,
  TaskPage,
  TaskRepository,
  TaskStatsFilter,
  TaskStatsSnapshot,
  TaskStatus,
  TimelineEvent,
  UpdateTaskInput,
} from '../../src/modules/tasks/task.types.js';
import { UserService } from '../../src/modules/users/user.service.js';
import type {
  AssignableUser,
  CreateUserInput,
  ManagedUser,
  SetUserActiveInput,
  UpdateUserInput,
  UserListFilter,
  UserPage,
  UserRepository,
  UserWithCredentials,
} from '../../src/modules/users/user.types.js';

export const TEST_AUTH_CONFIG = {
  jwtSecret: 'test-secret-with-at-least-32-characters!!',
  jwtExpiresIn: '1h',
};

/** Ids del catálogo inicial (mismo orden que 02a_access_control.sql). */
export const ROLE = { ADMIN: 1, SUPERVISOR: 2, COLLABORATOR: 3 } as const;
export const AREA = { OPERATIONS: 1, FINANCE: 2 } as const;

/** Hasher determinista y rápido para pruebas (bcrypt real es lento a propósito). */
export class FakePasswordHasher implements PasswordHasher {
  hash(plainText: string): Promise<string> {
    return Promise.resolve(`hashed:${plainText}`);
  }

  verify(plainText: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${plainText}`);
  }
}

type StoredRole = Omit<Role, 'usersCount'>;
type StoredArea = Omit<Area, 'usersCount' | 'openTasksCount'>;

/** Roles y áreas en memoria: reproduce las reglas de 05_procedures_access.sql. */
export class InMemoryAccess implements AccessRepository {
  readonly roles: StoredRole[] = [
    {
      id: ROLE.ADMIN,
      code: 'ADMIN',
      name: 'Administrador',
      description: null,
      isLocked: true,
      permissions: [...PERMISSIONS],
    },
    {
      id: ROLE.SUPERVISOR,
      code: 'SUPERVISOR',
      name: 'Supervisor',
      description: null,
      isLocked: false,
      permissions: ['TASKS_VIEW_AREA', 'TASKS_EDIT_ANY', 'TASKS_ASSIGN'],
    },
    {
      id: ROLE.COLLABORATOR,
      code: 'COLLABORATOR',
      name: 'Colaborador',
      description: null,
      isLocked: false,
      permissions: [],
    },
  ];

  readonly areas: StoredArea[] = [
    this.newArea(AREA.OPERATIONS, 'Operaciones'),
    this.newArea(AREA.FINANCE, 'Finanzas'),
  ];

  /** Se conecta después: el conteo de usuarios y la regla "rol en uso" lo necesitan. */
  users: InMemoryUserRepository | null = null;

  role(roleId: number): StoredRole | undefined {
    return this.roles.find((r) => r.id === roleId);
  }

  area(areaId: number | null): StoredArea | undefined {
    return this.areas.find((a) => a.id === areaId);
  }

  listPermissions(): Promise<PermissionInfo[]> {
    return Promise.resolve(
      PERMISSIONS.map((code) => ({ code, name: code, description: code, group: 'Tareas' })),
    );
  }

  listRoles(): Promise<Role[]> {
    return Promise.resolve(
      this.roles.map((role) => ({ ...role, usersCount: this.users?.countWithRole(role.id) ?? 0 })),
    );
  }

  createRole(input: RoleInput, actorId: number): Promise<number> {
    return this.attempt(() => {
      this.assertUniqueRoleName(input.name, null);
      this.assertActorHolds(
        input.permissions,
        actorId,
        'No puedes otorgar permisos que tú no tienes.',
      );
      const id = Math.max(...this.roles.map((r) => r.id)) + 1;
      this.roles.push({ id, code: null, isLocked: false, ...input });
      return id;
    });
  }

  updateRole(roleId: number, input: RoleInput, actorId: number): Promise<void> {
    return this.attempt(() => {
      const role = this.existingRole(roleId);
      if (role.isLocked) throw new ConflictError('El rol Administrador no se puede modificar.');
      if (this.users?.roleIdOf(actorId) === roleId) {
        throw new ConflictError('No puedes modificar tu propio rol.');
      }
      this.assertUniqueRoleName(input.name, roleId);
      this.assertActorHolds(
        [...role.permissions, ...input.permissions],
        actorId,
        'No puedes modificar un rol con permisos que tú no tienes.',
      );
      Object.assign(role, input);
    });
  }

  deleteRole(roleId: number, actorId: number): Promise<void> {
    return this.attempt(() => {
      const role = this.existingRole(roleId);
      if (role.code !== null)
        throw new ConflictError('Los roles del sistema no se pueden eliminar.');
      this.assertActorHolds(role.permissions, actorId, 'No puedes eliminar ese rol.');
      if (this.users?.countWithRole(roleId)) {
        throw new ConflictError('El rol tiene usuarios asignados.');
      }
      this.roles.splice(this.roles.indexOf(role), 1);
    });
  }

  listAreas(includeInactive: boolean): Promise<Area[]> {
    return Promise.resolve(
      this.areas
        .filter((a) => includeInactive || a.isActive)
        .map((a) => ({ ...a, usersCount: 0, openTasksCount: 0 })),
    );
  }

  saveArea(areaId: number | null, input: AreaInput): Promise<Area> {
    return this.attempt(() => {
      if (this.areas.some((a) => a.name === input.name && a.id !== areaId)) {
        throw new ConflictError('Ya existe un área con ese nombre.');
      }
      let area = areaId === null ? undefined : this.area(areaId);
      if (areaId !== null && !area) throw new NotFoundError('El área no existe.');
      if (!area) {
        area = this.newArea(this.areas.length + 1, input.name);
        this.areas.push(area);
      }
      Object.assign(area, input);
      return { ...area, usersCount: 0, openTasksCount: 0 };
    });
  }

  /** Mismo criterio que dbo.tvf_RolePermissionsNotHeld: el actor tiene todos esos permisos. */
  assertActorHolds(permissions: Permission[], actorId: number, message: string): void {
    const held = this.users?.permissionsOf(actorId) ?? [];
    if (permissions.some((p) => !held.includes(p))) throw new ForbiddenError(message);
  }

  private existingRole(roleId: number): StoredRole {
    const role = this.role(roleId);
    if (!role) throw new NotFoundError('El rol no existe.');
    return role;
  }

  private assertUniqueRoleName(name: string, exceptId: number | null): void {
    if (this.roles.some((r) => r.name === name && r.id !== exceptId)) {
      throw new ConflictError('Ya existe un rol con ese nombre.');
    }
  }

  private newArea(id: number, name: string): StoredArea {
    return { id, name, description: null, isActive: true, createdAt: new Date().toISOString() };
  }

  private attempt<T>(operation: () => T): Promise<T> {
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

interface StoredUser {
  id: number;
  username: string;
  fullName: string;
  roleId: number;
  areaId: number | null;
  isActive: boolean;
  createdAt: string;
  passwordChangedAt: string | null;
  passwordHash: string;
  deleted?: boolean;
  resetRequestedAt?: string | null;
  email: string | null;
}

/** Perfil de acceso de un usuario activo (lo que resuelve dbo.tvf_UserAccess). */
export interface AccessProfile {
  permissions: Permission[];
  areaId: number | null;
}

/** Reproduce las reglas de 05_procedures_users.sql para probar la API sin SQL Server. */
export class InMemoryUserRepository implements UserRepository {
  readonly users: StoredUser[] = [];

  constructor(readonly access: InMemoryAccess = new InMemoryAccess()) {
    access.users = this;
  }

  findByUsername(username: string): Promise<UserWithCredentials | null> {
    const user = this.users.find(
      (u) => this.isLive(u) && u.username.toLowerCase() === username.toLowerCase(),
    );
    return Promise.resolve(user ? this.credentials(user) : null);
  }

  findCredentialsById(userId: number): Promise<UserWithCredentials | null> {
    const user = this.live(userId);
    return Promise.resolve(user ? this.credentials(user) : null);
  }

  findSessionState(userId: number): Promise<SessionState | null> {
    const user = this.live(userId);
    return Promise.resolve(
      user
        ? { user: this.authUser(user), passwordVersion: passwordVersionOf(user.passwordChangedAt) }
        : null,
    );
  }

  list({ page, pageSize, search, roleId, areaId, status, pendingReset }: UserListFilter) {
    const text = search?.toLowerCase();
    const matching = this.users.filter(
      (u) =>
        !u.deleted &&
        (!text ||
          u.fullName.toLowerCase().includes(text) ||
          u.username.toLowerCase().includes(text)) &&
        (roleId === undefined || u.roleId === roleId) &&
        (areaId === undefined || u.areaId === areaId) &&
        (status === undefined || u.isActive === (status === 'ACTIVE')) &&
        (!pendingReset || Boolean(u.resetRequestedAt)),
    );
    const start = (page - 1) * pageSize;
    const users = matching.slice(start, start + pageSize).map((u) => this.managed(u));
    return Promise.resolve<UserPage>({ users, total: matching.length });
  }

  /** Enlaces de restablecimiento: hash del token → usuario, vencimiento y uso. */
  readonly resetTokens = new Map<string, { userId: number; expiresAt: Date; used: boolean }>();

  requestPasswordReset(identifier: string, tokenHash: string, expiresAt: Date) {
    const value = identifier.trim();
    const user = this.users.find(
      (u) => this.isLive(u) && (u.username === value || u.email === value.toLowerCase()),
    );
    if (!user) return Promise.resolve(null);
    if (!user.email) {
      user.resetRequestedAt ??= new Date().toISOString();
      return Promise.resolve(null);
    }
    this.resetTokens.set(tokenHash, { userId: user.id, expiresAt, used: false });
    return Promise.resolve({ email: user.email, fullName: user.fullName });
  }

  consumePasswordReset(tokenHash: string, passwordHash: string): Promise<void> {
    const entry = this.resetTokens.get(tokenHash);
    const user = entry && this.live(entry.userId);
    if (!entry || entry.used || entry.expiresAt.getTime() <= Date.now() || !user) {
      return Promise.reject(new ValidationError('El enlace no es válido o ya expiró.'));
    }
    entry.used = true;
    Object.assign(user, {
      passwordHash,
      passwordChangedAt: new Date().toISOString(),
      resetRequestedAt: null,
    });
    return Promise.resolve();
  }

  async create({ actorId, ...input }: CreateUserInput): Promise<ManagedUser> {
    await this.validateAssignment(input.roleId, input.areaId, actorId);
    if (this.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
      throw new ConflictError('El nombre de usuario ya existe.');
    }
    const user: StoredUser = {
      id: this.users.length + 1,
      ...input,
      isActive: true,
      createdAt: new Date().toISOString(),
      passwordChangedAt: null,
    };
    this.users.push(user);
    return this.managed(user);
  }

  async update({ userId, fullName, roleId, areaId, changedBy, email }: UpdateUserInput) {
    const user = await this.manageable(userId, changedBy);
    if (roleId !== user.roleId) {
      if (userId === changedBy) throw new ConflictError('No puedes cambiar tu propio rol.');
      this.assertNotLastAdmin(user);
    }
    await this.validateAssignment(roleId, areaId, changedBy);
    Object.assign(user, { fullName, roleId, areaId, ...(email !== undefined && { email }) });
    return this.managed(user);
  }

  async setActive({ userId, isActive, changedBy }: SetUserActiveInput): Promise<ManagedUser> {
    if (!isActive && userId === changedBy) {
      await this.find(userId);
      throw new ConflictError('No puedes desactivar tu propio usuario.');
    }
    const user = await this.manageable(userId, changedBy);
    if (!isActive) this.assertNotLastAdmin(user);
    user.isActive = isActive;
    return this.managed(user);
  }

  async updatePassword(userId: number, passwordHash: string, actorId: number | null) {
    const user =
      actorId === null || actorId === userId
        ? await this.find(userId)
        : await this.manageable(userId, actorId);
    Object.assign(user, {
      passwordHash,
      passwordChangedAt: new Date().toISOString(),
      resetRequestedAt: null,
    });
  }

  listAssignable(actorId: number): Promise<AssignableUser[]> {
    const actor = this.profileOf(actorId);
    const viewAll = actor?.permissions.includes('TASKS_VIEW_ALL') ?? false;
    const visible = this.users.filter(
      (u) =>
        this.isLive(u) &&
        (viewAll || u.id === actorId || (actor?.areaId != null && u.areaId === actor.areaId)),
    );
    return Promise.resolve(
      visible.map(({ id, username, fullName, areaId }) => ({
        id,
        username,
        fullName,
        area: this.areaRef(areaId),
      })),
    );
  }

  activateDemoAccounts(): Promise<number> {
    return Promise.resolve(0);
  }

  async delete(userId: number, changedBy: number): Promise<number> {
    await this.find(userId);
    if (userId === changedBy) throw new ConflictError('No puedes eliminar tu propio usuario.');
    const user = await this.manageable(userId, changedBy);
    this.assertNotLastAdmin(user);
    Object.assign(user, { deleted: true, isActive: false });
    return 0;
  }

  // ---- Consultas que usan los demás fakes ----

  profileOf(userId: number): AccessProfile | null {
    const user = this.live(userId);
    return user ? { permissions: this.permissionsOf(userId), areaId: user.areaId } : null;
  }

  permissionsOf(userId: number): Permission[] {
    const user = this.live(userId);
    return user ? [...(this.access.role(user.roleId)?.permissions ?? [])] : [];
  }

  roleIdOf(userId: number): number | undefined {
    return this.live(userId)?.roleId;
  }

  countWithRole(roleId: number): number {
    return this.users.filter((u) => !u.deleted && u.roleId === roleId).length;
  }

  // ---- Reglas ----

  private async validateAssignment(roleId: number, areaId: number | null, actorId: number | null) {
    const role = this.access.role(roleId);
    if (!role) throw new ValidationError('El rol indicado no existe.');
    if (areaId !== null && !this.access.area(areaId)?.isActive) {
      throw new ValidationError('El área indicada no existe o está inactiva.');
    }
    if (actorId !== null) {
      this.access.assertActorHolds(
        role.permissions,
        actorId,
        'No puedes asignar un rol con permisos que tú no tienes.',
      );
    }
    return Promise.resolve();
  }

  /** El actor solo gestiona a usuarios que no tengan más permisos que él. */
  private async manageable(userId: number, actorId: number): Promise<StoredUser> {
    const user = await this.find(userId);
    this.access.assertActorHolds(
      this.access.role(user.roleId)?.permissions ?? [],
      actorId,
      'No puedes gestionar a un usuario con más permisos que los tuyos.',
    );
    return user;
  }

  private assertNotLastAdmin(user: StoredUser): void {
    const isActiveAdmin = (u: StoredUser) => this.isLive(u) && u.roleId === ROLE.ADMIN;
    if (isActiveAdmin(user) && !this.users.some((u) => u.id !== user.id && isActiveAdmin(u))) {
      throw new ConflictError('Debe quedar al menos un Administrador activo.');
    }
  }

  private find(userId: number): Promise<StoredUser> {
    const user = this.users.find((u) => u.id === userId && !u.deleted);
    return user
      ? Promise.resolve(user)
      : Promise.reject(new NotFoundError('El usuario no existe.'));
  }

  private isLive(user: StoredUser): boolean {
    return user.isActive && !user.deleted;
  }

  private live(userId: number): StoredUser | undefined {
    return this.users.find((u) => u.id === userId && this.isLive(u));
  }

  private areaRef(areaId: number | null): NamedRef | null {
    const area = this.access.area(areaId);
    return area ? { id: area.id, name: area.name } : null;
  }

  private roleRef(roleId: number): NamedRef {
    return { id: roleId, name: this.access.role(roleId)?.name ?? '' };
  }

  private authUser(user: StoredUser): AuthUser {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: this.roleRef(user.roleId),
      area: this.areaRef(user.areaId),
      permissions: this.permissionsOf(user.id),
    };
  }

  private credentials(user: StoredUser): UserWithCredentials {
    const { id, username, fullName, passwordHash, passwordChangedAt } = user;
    return { id, username, fullName, passwordHash, passwordChangedAt };
  }

  private managed(user: StoredUser): ManagedUser {
    const { id, username, fullName, isActive, createdAt, passwordChangedAt } = user;
    return {
      id,
      username,
      fullName,
      email: user.email,
      role: this.roleRef(user.roleId),
      area: this.areaRef(user.areaId),
      isActive,
      createdAt,
      passwordChangedAt,
      passwordResetRequestedAt: user.resetRequestedAt ?? null,
    };
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

const person = (id: number): NamedRef => ({ id, name: `Usuario ${id}` });

/** Reproduce las reglas de los Stored Procedures de tareas para probar sin SQL Server. */
export class InMemoryTaskRepository implements TaskRepository {
  readonly tasks: Task[] = [];
  readonly notes: (TaskNote & { taskId: number })[] = [];

  constructor(private readonly users: InMemoryUserRepository) {}

  /** Mismo predicado que la BD: todas, las de su área, o asignadas a él / creadas por él. */
  private visibleTo(viewerId: number): Task[] {
    const viewer = this.users.profileOf(viewerId);
    if (!viewer) return [];
    return this.tasks.filter(
      (t) =>
        viewer.permissions.includes('TASKS_VIEW_ALL') ||
        (viewer.permissions.includes('TASKS_VIEW_AREA') &&
          viewer.areaId !== null &&
          t.area?.id === viewer.areaId) ||
        t.assignedTo?.id === viewerId ||
        t.createdBy.id === viewerId,
    );
  }

  private findVisible(taskId: number, viewerId: number): Task {
    const task = this.visibleTo(viewerId).find((t) => t.id === taskId);
    if (!task) throw new NotFoundError('La tarea no existe.');
    return task;
  }

  private areaRef(areaId: number | null): NamedRef | null {
    const area = this.users.access.area(areaId);
    return area ? { id: area.id, name: area.name } : null;
  }

  /** usp_Tasks_ValidateAssignee: sin TASKS_VIEW_ALL, solo a sí mismo o a su área. */
  private validateAssignee(assignedTo: number | null, actorId: number): void {
    if (assignedTo === null) return;
    const assignee = this.users.profileOf(assignedTo);
    if (!assignee) throw new ValidationError('El responsable debe ser un usuario activo.');
    const actor = this.users.profileOf(actorId);
    if (
      !actor?.permissions.includes('TASKS_VIEW_ALL') &&
      assignedTo !== actorId &&
      (actor?.areaId == null || assignee.areaId !== actor.areaId)
    ) {
      throw new ForbiddenError('Solo puedes asignar tareas a personas de tu área.');
    }
  }

  private run<T>(operation: () => T): Promise<T> {
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  list({
    status,
    areaId,
    search,
    priority,
    page,
    pageSize,
    viewerId,
  }: ListTasksFilter): Promise<TaskPage> {
    if (status && !this.findStatus(status)) {
      return Promise.reject(new ValidationError('El estado indicado no existe.'));
    }
    const filtered = this.visibleTo(viewerId)
      .filter((task) => !status || task.status.code === status)
      .filter((task) => areaId === undefined || task.area?.id === areaId)
      .filter((task) => !priority || task.priority === priority)
      .filter((task) => !search || task.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.id - a.id);
    const start = (page - 1) * pageSize;
    return Promise.resolve({
      tasks: filtered.slice(start, start + pageSize),
      total: filtered.length,
    });
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.run(() => {
      const creator = this.users.profileOf(input.createdBy);
      if (!creator) throw new ValidationError('El usuario creador no es válido.');
      const can = (p: Permission) => creator.permissions.includes(p);
      if (
        !can('TASKS_ASSIGN') &&
        input.assignedTo !== null &&
        input.assignedTo !== input.createdBy
      ) {
        throw new ForbiddenError('No tienes permiso para asignar tareas a otras personas.');
      }
      let areaId = input.areaId;
      if (!can('TASKS_VIEW_ALL')) {
        if (areaId !== null && areaId !== creator.areaId) {
          throw new ForbiddenError('Solo puedes crear tareas en tu área.');
        }
        areaId = creator.areaId;
      }
      this.validateAssignee(input.assignedTo, input.createdBy);

      const now = new Date().toISOString();
      const task: Task = {
        id: this.tasks.length + 1,
        title: input.title,
        description: input.description,
        status: { code: 'PENDING', name: 'Pendiente' },
        priority: input.priority,
        dueDate: input.dueDate,
        createdBy: person(input.createdBy),
        assignedTo: input.assignedTo === null ? null : person(input.assignedTo),
        area: this.areaRef(areaId),
        notesCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.push(task);
      return task;
    });
  }

  update({ taskId, assignedTo, areaId, actorId, ...data }: UpdateTaskInput): Promise<Task> {
    return this.run(() => {
      const task = this.findVisible(taskId, actorId);
      const actor = this.users.profileOf(actorId);
      const can = (p: Permission) => actor?.permissions.includes(p) ?? false;
      if (!can('TASKS_EDIT_ANY') && task.createdBy.id !== actorId) {
        throw new ForbiddenError('Solo puedes editar las tareas que creaste.');
      }
      if (assignedTo !== undefined && assignedTo !== (task.assignedTo?.id ?? null)) {
        if (!can('TASKS_ASSIGN')) throw new ForbiddenError('No puedes cambiar el responsable.');
        this.validateAssignee(assignedTo, actorId);
        task.assignedTo = assignedTo === null ? null : person(assignedTo);
      }
      if (areaId !== undefined && areaId !== (task.area?.id ?? null)) {
        if (!can('TASKS_VIEW_ALL')) throw new ForbiddenError('No puedes mover tareas entre áreas.');
        task.area = this.areaRef(areaId);
      }
      Object.assign(task, data);
      return task;
    });
  }

  changeStatus({ taskId, status, changedBy }: ChangeTaskStatusInput): Promise<Task> {
    return this.run(() => {
      const target = this.findStatus(status);
      if (!target) throw new ValidationError('El estado indicado no existe.');
      const task = this.findVisible(taskId, changedBy);
      if (!this.findStatus(task.status.code)?.allowedTransitions.includes(status)) {
        throw new ConflictError('No se permite ese cambio de estado.');
      }
      task.status = { code: target.code, name: target.name };
      return task;
    });
  }

  listStatuses(): Promise<TaskStatus[]> {
    return Promise.resolve(STATUSES);
  }

  addNote({ taskId, body, createdBy }: AddTaskNoteInput): Promise<TaskNote> {
    return this.run(() => {
      const task = this.findVisible(taskId, createdBy);
      const note = {
        taskId,
        id: this.notes.length + 1,
        body: body.trim(),
        author: person(createdBy),
        createdAt: new Date().toISOString(),
      };
      this.notes.push(note);
      task.notesCount += 1;
      return note;
    });
  }

  /** Versión simplificada: creación + avances (suficiente para probar la API). */
  timeline(taskId: number, viewerId: number): Promise<TimelineEvent[]> {
    return this.run(() => {
      const task = this.findVisible(taskId, viewerId);
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
      return [created, ...notes];
    });
  }

  stats({ today, areaId, viewerId }: TaskStatsFilter): Promise<TaskStatsSnapshot> {
    const day = today ?? new Date().toISOString().slice(0, 10);
    const visible = this.visibleTo(viewerId).filter(
      (t) => areaId === undefined || t.area?.id === areaId,
    );
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

  /** Versión simplificada: sin historial, el tiempo de cierre se toma de updatedAt. */
  statsByArea({ today, viewerId }: AreaPerformanceFilter): Promise<AreaPerformance[]> {
    const day = today ?? new Date().toISOString().slice(0, 10);
    const groups = new Map<number | null, Task[]>();
    for (const task of this.visibleTo(viewerId)) {
      const key = task.area?.id ?? null;
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }
    return Promise.resolve(
      [...groups.values()].map((tasks) => {
        const open = tasks.filter((t) => !this.findStatus(t.status.code)?.isFinal);
        const closed = tasks.filter((t) => t.status.code === 'COMPLETED');
        const hours = closed.map(
          (t) => (Date.parse(t.updatedAt) - Date.parse(t.createdAt)) / 3_600_000,
        );
        return {
          area: tasks[0]?.area ?? null,
          open: open.length,
          overdue: open.filter((t) => t.dueDate !== null && t.dueDate < day).length,
          closed: closed.length,
          avgResolutionHours: hours.length
            ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10
            : null,
        };
      }),
    );
  }

  private findStatus(code: string): TaskStatus | undefined {
    return STATUSES.find((s) => s.code === code);
  }
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

export interface NewTestUser {
  username: string;
  email?: string | null;
  fullName?: string;
  roleId: number;
  areaId: number | null;
  password?: string;
}

/** Agrega un usuario directamente (sin pasar por las reglas de quién lo crea). */
export async function addUser(
  users: InMemoryUserRepository,
  {
    username,
    fullName = username,
    email = null,
    roleId,
    areaId,
    password = 'Clave-Prueba-123',
  }: NewTestUser,
): Promise<number> {
  const user = await users.create({
    username,
    fullName,
    email,
    passwordHash: await new FakePasswordHasher().hash(password),
    roleId,
    areaId,
    actorId: null,
  });
  return user.id;
}

/** Usuarios base: id 1 = Administrador (sin área), id 2 = Colaborador de Operaciones. */
export async function createTestUsers(): Promise<InMemoryUserRepository> {
  const users = new InMemoryUserRepository();
  await addUser(users, { ...TEST_USER, roleId: ROLE.ADMIN, areaId: null });
  await addUser(users, { ...TEST_AGENT, roleId: ROLE.COLLABORATOR, areaId: AREA.OPERATIONS });
  return users;
}

/** Usuario autenticado tal como lo arma el middleware (rol, área y permisos vigentes). */
export async function authUserOf(users: InMemoryUserRepository, id: number): Promise<AuthUser> {
  const session = await users.findSessionState(id);
  if (!session) throw new Error(`El usuario ${String(id)} no está activo.`);
  return session.user;
}

export interface TestContext {
  app: ReturnType<typeof createApp>;
  users: InMemoryUserRepository;
  tasks: InMemoryTaskRepository;
  tokenService: JwtTokenService;
  mail: InMemoryMailSender;
  databaseUp: { value: boolean };
}

/** Bandeja en memoria: guarda los correos "enviados" para inspeccionarlos. */
export class InMemoryMailSender implements MailSender {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

/** Captcha fácil (máximo 50 intentos) para que las pruebas lo resuelvan al instante. */
export const createTestCaptcha = () =>
  new ProofOfWorkCaptcha('test-captcha-secret', { maxNumber: 50, ttlMs: 60_000 });

/**
 * Arma la app real (rutas, middlewares, errores) con dependencias en memoria.
 * El captcha está desactivado salvo que se pase uno (como con AUTH_CAPTCHA=false).
 */
export async function buildTestContext(
  options: { captcha?: ProofOfWorkCaptcha | null } = {},
): Promise<TestContext> {
  const users = await createTestUsers();
  const tasks = new InMemoryTaskRepository(users);
  const hasher = new FakePasswordHasher();
  const tokenService = new JwtTokenService(TEST_AUTH_CONFIG);
  const databaseUp = { value: true };
  const mail = new InMemoryMailSender();

  const app = createApp({
    config: { trustProxy: 0, corsOrigins: ['http://localhost:8080'] },
    logger: pino({ level: 'silent' }),
    authService: new AuthService(users, hasher, tokenService, {
      mailer: mail,
      logger: pino({ level: 'silent' }),
      publicUrl: 'http://localhost:8080',
    }),
    taskService: new TaskService(tasks),
    userService: new UserService(users, hasher),
    accessService: new AccessService(users.access),
    tokenService,
    sessionStore: users,
    captcha: options.captcha ?? null,
    checkDatabase: () => (databaseUp.value ? Promise.resolve() : Promise.reject(new Error('down'))),
    failedAttemptsLimit: { windowMs: 60_000, limit: 3 },
  });

  return { app, users, tasks, tokenService, mail, databaseUp };
}

/**
 * Token de un usuario como lo emitiría un login real (con su versión de contraseña vigente).
 * 'ADMIN' = id 1, 'AGENT' = id 2 (Colaborador), o un id cualquiera.
 */
export function bearerFor(context: TestContext, who: 'ADMIN' | 'AGENT' | number = 'ADMIN'): string {
  const id = who === 'ADMIN' ? 1 : who === 'AGENT' ? 2 : who;
  const stored = context.users.users.find((u) => u.id === id);
  if (!stored) throw new Error(`No existe el usuario de prueba ${String(id)}.`);
  const { token } = context.tokenService.issue(
    { id, username: stored.username, fullName: stored.fullName },
    passwordVersionOf(stored.passwordChangedAt),
  );
  return `Bearer ${token}`;
}
