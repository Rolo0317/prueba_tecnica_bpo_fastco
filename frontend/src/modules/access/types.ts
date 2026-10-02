/** Mismo catálogo que la API: cada permiso habilita acciones concretas. */
export type Permission =
  | 'TASKS_VIEW_ALL'
  | 'TASKS_VIEW_AREA'
  | 'TASKS_EDIT_ANY'
  | 'TASKS_ASSIGN'
  | 'USERS_MANAGE'
  | 'AREAS_MANAGE'
  | 'ROLES_MANAGE';

/** Referencia a otra entidad: rol, área, persona… */
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
  /** Roles del sistema (ADMIN, SUPERVISOR, COLLABORATOR); null = creado por un administrador. */
  code: string | null;
  name: string;
  description: string | null;
  /** Administrador: no se edita ni se elimina. */
  isLocked: boolean;
  permissions: Permission[];
  usersCount: number;
}

export interface RolePayload {
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

export interface NewAreaPayload {
  name: string;
  description: string | null;
}

export interface AreaPayload extends NewAreaPayload {
  isActive: boolean;
}
