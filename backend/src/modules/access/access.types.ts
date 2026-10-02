/**
 * Catálogo de permisos. Es fijo porque cada permiso lo hace cumplir el código (API y SPs);
 * lo configurable es qué permisos tiene cada rol.
 */
export const PERMISSIONS = [
  'TASKS_VIEW_ALL',
  'TASKS_VIEW_AREA',
  'TASKS_EDIT_ANY',
  'TASKS_ASSIGN',
  'USERS_MANAGE',
  'AREAS_MANAGE',
  'ROLES_MANAGE',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value);

/** Convierte la lista CSV que devuelven los SPs en permisos conocidos. */
export function parsePermissions(csv: string | null): Permission[] {
  return (csv ?? '').split(',').filter(isPermission);
}

/** ¿Tiene el usuario el permiso? */
export function can(user: { permissions: readonly Permission[] }, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

/** Referencia a otra entidad: { id, name } (rol, área, persona…). */
export interface NamedRef {
  id: number;
  name: string;
}

export interface PermissionInfo {
  code: Permission;
  name: string;
  description: string;
  group: string;
}

export interface Role {
  id: number;
  /** Código estable de los roles del sistema (ADMIN, SUPERVISOR, COLLABORATOR); null = rol creado. */
  code: string | null;
  name: string;
  description: string | null;
  /** Rol protegido (Administrador): no se edita ni se elimina. */
  isLocked: boolean;
  permissions: Permission[];
  usersCount: number;
}

export interface RoleInput {
  name: string;
  description: string | null;
  permissions: Permission[];
}

export interface Area {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  usersCount: number;
  openTasksCount: number;
}

export interface AreaInput {
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface AccessRepository {
  listPermissions(): Promise<PermissionInfo[]>;
  listRoles(): Promise<Role[]>;
  /** Devuelve el id del rol creado. */
  createRole(input: RoleInput, actorId: number): Promise<number>;
  updateRole(roleId: number, input: RoleInput, actorId: number): Promise<void>;
  deleteRole(roleId: number, actorId: number): Promise<void>;
  listAreas(includeInactive: boolean): Promise<Area[]>;
  /** areaId null = crear. */
  saveArea(areaId: number | null, input: AreaInput): Promise<Area>;
}
