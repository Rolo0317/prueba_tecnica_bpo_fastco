import { NotFoundError } from '../../core/errors.js';
import type {
  AccessRepository,
  Area,
  AreaInput,
  PermissionInfo,
  Role,
  RoleInput,
} from './access.types.js';

/**
 * Roles, permisos y áreas. Las reglas contra la escalada de privilegios (no otorgar
 * permisos que uno no tiene, no editar el propio rol, Administrador bloqueado) viven
 * en los Stored Procedures, que reciben siempre quién hace el cambio.
 */
export class AccessService {
  constructor(private readonly access: AccessRepository) {}

  listPermissions(): Promise<PermissionInfo[]> {
    return this.access.listPermissions();
  }

  listRoles(): Promise<Role[]> {
    return this.access.listRoles();
  }

  async findRoleIdByCode(code: string): Promise<number> {
    const role = (await this.access.listRoles()).find((r) => r.code === code);
    if (!role) throw new NotFoundError(`No existe el rol del sistema ${code}.`);
    return role.id;
  }

  async createRole(input: RoleInput, actorId: number): Promise<Role> {
    return this.findRole(await this.access.createRole(input, actorId));
  }

  async updateRole(roleId: number, input: RoleInput, actorId: number): Promise<Role> {
    await this.access.updateRole(roleId, input, actorId);
    return this.findRole(roleId);
  }

  deleteRole(roleId: number, actorId: number): Promise<void> {
    return this.access.deleteRole(roleId, actorId);
  }

  listAreas(includeInactive: boolean): Promise<Area[]> {
    return this.access.listAreas(includeInactive);
  }

  createArea(input: Omit<AreaInput, 'isActive'>): Promise<Area> {
    return this.access.saveArea(null, { ...input, isActive: true });
  }

  updateArea(areaId: number, input: AreaInput): Promise<Area> {
    return this.access.saveArea(areaId, input);
  }

  private async findRole(roleId: number): Promise<Role> {
    const role = (await this.access.listRoles()).find((r) => r.id === roleId);
    if (!role) throw new NotFoundError('El rol no existe.');
    return role;
  }
}
