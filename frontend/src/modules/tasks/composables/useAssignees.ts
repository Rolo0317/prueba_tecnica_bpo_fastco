import { computed } from 'vue';
import { userService, type UserService } from '@/modules/users/services/userService';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import type { Assignee } from '../types';

/** Usuarios activos a los que un administrador puede asignar tareas. */
export function useAssignees(service: Pick<UserService, 'listAssignable'> = userService) {
  const { data, loading, error, execute } = useAsyncState(() => service.listAssignable());
  const assignees = computed<Assignee[]>(() => data.value ?? []);
  return { assignees, loading, error, load: execute };
}
