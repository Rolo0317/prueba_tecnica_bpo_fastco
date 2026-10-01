import { http, type ApiClient } from '@/core/http';
import type { Paginated } from '@/shared/types/pagination';
import type { Assignee } from '@/modules/tasks/types';
import type { ManagedUser, NewUserPayload, UpdateUserPayload } from '../types';

export function createUserService(client: ApiClient) {
  return {
    list: (page: number, pageSize: number) =>
      client.get<Paginated<ManagedUser>>('/users', { page, pageSize }),
    create: (payload: NewUserPayload) => client.post<ManagedUser>('/users', payload),
    update: (id: number, payload: UpdateUserPayload) =>
      client.patch<ManagedUser>(`/users/${String(id)}`, payload),
    setActive: (id: number, isActive: boolean) =>
      client.patch<ManagedUser>(`/users/${String(id)}/status`, { isActive }),
    remove: (id: number) => client.delete<{ unassignedTasks: number }>(`/users/${String(id)}`),
    listAssignable: () => client.get<Assignee[]>('/users/assignable'),
    resetPassword: (id: number, newPassword: string) =>
      client.put(`/users/${String(id)}/password`, { newPassword }),
  };
}

export type UserService = ReturnType<typeof createUserService>;

export const userService = createUserService(http);
