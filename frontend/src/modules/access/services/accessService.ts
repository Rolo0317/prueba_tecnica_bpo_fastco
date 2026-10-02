import { http, type ApiClient } from '@/core/http';
import type {
  Area,
  AreaPayload,
  NewAreaPayload,
  PermissionInfo,
  Role,
  RolePayload,
} from '../types';

export function createAccessService(client: ApiClient) {
  return {
    listPermissions: () => client.get<PermissionInfo[]>('/permissions'),
    listRoles: () => client.get<Role[]>('/roles'),
    createRole: (payload: RolePayload) => client.post<Role>('/roles', payload),
    updateRole: (id: number, payload: RolePayload) =>
      client.put<Role>(`/roles/${String(id)}`, payload),
    deleteRole: (id: number) => client.delete(`/roles/${String(id)}`),
    listAreas: (includeInactive = false) =>
      client.get<Area[]>('/areas', includeInactive ? { includeInactive: 'true' } : undefined),
    createArea: (payload: NewAreaPayload) => client.post<Area>('/areas', payload),
    updateArea: (id: number, payload: AreaPayload) =>
      client.patch<Area>(`/areas/${String(id)}`, payload),
  };
}

export type AccessService = ReturnType<typeof createAccessService>;

export const accessService = createAccessService(http);
