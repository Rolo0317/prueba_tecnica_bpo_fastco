import { useAsyncState } from '@/shared/composables/useAsyncState';
import { todayIso } from '@/shared/utils/dates';
import { taskService, type TaskService } from '../services/taskService';

/**
 * Indicadores del panel. Se envía la fecha local del usuario para que "vencidas" y
 * "vencen hoy" correspondan a su calendario y no al del servidor. Con un área
 * seleccionada, los indicadores se calculan solo para esa área.
 */
export function useTaskStats(
  service: Pick<TaskService, 'stats'> = taskService,
  areaId: () => number | null = () => null,
) {
  const { data, loading, error, execute } = useAsyncState(() =>
    service.stats(todayIso(), areaId()),
  );
  return { stats: data, loading, error, load: execute };
}
