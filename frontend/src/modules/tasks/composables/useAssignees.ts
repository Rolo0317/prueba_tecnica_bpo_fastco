import { computed } from 'vue';
import { userService, type UserService } from '@/modules/users/services/userService';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import type { Assignee } from '../types';

/** Responsables posibles para quien asigna: todos, o los de su área (lo decide la API). */
export function useAssignees(service: Pick<UserService, 'listAssignable'> = userService) {
  const { data, loading, error, execute } = useAsyncState(() => service.listAssignable());
  const assignees = computed<Assignee[]>(() => data.value ?? []);
  return { assignees, loading, error, load: execute };
}
