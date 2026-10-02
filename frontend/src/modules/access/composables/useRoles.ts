import { computed } from 'vue';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { accessService, type AccessService } from '../services/accessService';
import type { PermissionInfo, Role, RolePayload } from '../types';

type RoleApi = Pick<
  AccessService,
  'listRoles' | 'listPermissions' | 'createRole' | 'updateRole' | 'deleteRole'
>;

export interface PermissionGroup {
  name: string;
  permissions: PermissionInfo[];
}

/** Agrupa el catálogo de permisos para mostrarlo por secciones (Tareas, Administración…). */
export function groupPermissions(permissions: PermissionInfo[]): PermissionGroup[] {
  const groups = new Map<string, PermissionInfo[]>();
  for (const permission of permissions) {
    groups.set(permission.group, [...(groups.get(permission.group) ?? []), permission]);
  }
  return [...groups].map(([name, list]) => ({ name, permissions: list }));
}

/** ViewModel de roles: listado, catálogo de permisos y acciones. */
export function useRoles(service: RoleApi = accessService) {
  const list = useAsyncState(() => service.listRoles());
  const catalog = useAsyncState(() => service.listPermissions());

  const roles = computed<Role[]>(() => list.data.value ?? []);
  const permissions = computed<PermissionInfo[]>(() => catalog.data.value ?? []);
  const permissionGroups = computed(() => groupPermissions(permissions.value));
  const permissionName = (code: string) =>
    permissions.value.find((p) => p.code === code)?.name ?? code;

  async function create(payload: RolePayload): Promise<Role> {
    const role = await service.createRole(payload);
    await list.execute();
    return role;
  }

  async function update(id: number, payload: RolePayload): Promise<Role> {
    const role = await service.updateRole(id, payload);
    await list.execute();
    return role;
  }

  async function remove(role: Role): Promise<void> {
    await service.deleteRole(role.id);
    await list.execute();
  }

  return {
    roles,
    permissions,
    permissionGroups,
    permissionName,
    loading: list.loading,
    error: list.error,
    load: () => Promise.all([list.execute(), catalog.execute()]),
    reload: list.execute,
    create,
    update,
    remove,
  };
}
