import { computed } from 'vue';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { taskService, type TaskService } from '../services/taskService';
import type { TaskStatus } from '../types';

/**
 * Catálogo de estados con sus transiciones permitidas. Viene de la BD, así que la
 * regla de negocio no se duplica en el frontend: solo se ofrecen cambios válidos.
 */
export function useTaskStatuses(service: Pick<TaskService, 'listStatuses'> = taskService) {
  const { data, loading, error, execute } = useAsyncState(() => service.listStatuses());

  const statuses = computed<TaskStatus[]>(() => data.value ?? []);
  const byCode = computed(() => new Map(statuses.value.map((status) => [status.code, status])));

  function transitionsFor(code: string): TaskStatus[] {
    const allowed = byCode.value.get(code)?.allowedTransitions ?? [];
    return allowed.flatMap((target) => byCode.value.get(target) ?? []);
  }

  return { statuses, loading, error, load: execute, transitionsFor };
}
