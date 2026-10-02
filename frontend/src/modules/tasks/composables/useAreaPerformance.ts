import { computed } from 'vue';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { todayIso } from '@/shared/utils/dates';
import { taskService, type TaskService } from '../services/taskService';
import type { AreaPerformance } from '../types';

export const PERFORMANCE_DAYS = 30;

/** Desempeño por área en los últimos 30 días (dentro del alcance del usuario). */
export function useAreaPerformance(service: Pick<TaskService, 'statsByArea'> = taskService) {
  const { data, loading, error, execute } = useAsyncState(() =>
    service.statsByArea(todayIso(), PERFORMANCE_DAYS),
  );
  const rows = computed<AreaPerformance[]>(() => data.value ?? []);
  return { rows, loading, error, load: execute };
}
