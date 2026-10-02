import { UnauthorizedError, ValidationError } from '../../core/errors.js';
import { toPaginated, type Paginated } from '../../core/pagination.js';
import type { PasswordHasher } from '../auth/auth.types.js';
import type { ManagedUser, UserAssignment, UserRepository } from './user.types.js';

export interface NewUser extends UserAssignment {
  username: string;
  fullName: string;
  password: string;
}

/**
 * Casos de uso de usuarios. Las reglas de integridad y seguridad (sin escalada de
 * privilegios, no auto-desactivarse, siempre un Administrador activo) viven en los
 * Stored Procedures, que reciben quién hace cada cambio; aquí se aplica el hash de
 * contraseñas y la verificación de la contraseña actual.
 */
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async list(page: number, pageSize: number): Promise<Paginated<ManagedUser>> {
    const { users, total } = await this.users.list(page, pageSize);
    return toPaginated(users, total, page, pageSize);
  }

  async create({ password, ...user }: NewUser, actorId: number): Promise<ManagedUser> {
    const passwordHash = await this.passwordHasher.hash(password);
    return this.users.create({ ...user, passwordHash, actorId });
  }

  update(userId: number, data: UserAssignment & { fullName: string }, changedBy: number) {
    return this.users.update({ userId, ...data, changedBy });
  }

  setActive(userId: number, isActive: boolean, changedBy: number) {
    return this.users.setActive({ userId, isActive, changedBy });
  }

  listAssignable(actorId: number) {
    return this.users.listAssignable(actorId);
  }

  /** Eliminación lógica: se conserva el rastro en tareas e historial (auditoría). */
  async remove(userId: number, changedBy: number): Promise<{ unassignedTasks: number }> {
    return { unassignedTasks: await this.users.delete(userId, changedBy) };
  }

  /** Quien administra usuarios asigna una contraseña nueva a otro (p. ej. si la olvidó). */
  async resetPassword(userId: number, newPassword: string, actorId: number): Promise<void> {
    await this.users.updatePassword(userId, await this.passwordHasher.hash(newPassword), actorId);
  }

  /** Cualquier usuario cambia su propia contraseña demostrando que conoce la actual. */
  async changeOwnPassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.users.findCredentialsById(userId);
    if (!user) {
      throw new UnauthorizedError('Tu usuario ya no está activo.');
    }
    // 400 y no 401: la sesión es válida, solo el dato ingresado es incorrecto
    // (un 401 haría que el cliente cerrara la sesión).
    if (!(await this.passwordHasher.verify(currentPassword, user.passwordHash))) {
      throw new ValidationError('La contraseña actual no es correcta.', [
        { field: 'currentPassword', message: 'La contraseña actual no es correcta.' },
      ]);
    }
    if (currentPassword === newPassword) {
      throw new ValidationError('La nueva contraseña debe ser diferente de la actual.', [
        { field: 'newPassword', message: 'Debe ser diferente de la contraseña actual.' },
      ]);
    }
    await this.users.updatePassword(userId, await this.passwordHasher.hash(newPassword), null);
  }
}
