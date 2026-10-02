import { computed } from 'vue';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { accessService, type AccessService } from '../services/accessService';
import type { Area, AreaPayload, NewAreaPayload } from '../types';

type AreaApi = Pick<AccessService, 'listAreas' | 'createArea' | 'updateArea'>;

/**
 * ViewModel de áreas. `includeInactive` = true para la administración; los selectores
 * (tareas, usuarios) solo muestran las activas.
 */
export function useAreas(service: AreaApi = accessService, includeInactive = false) {
  const list = useAsyncState(() => service.listAreas(includeInactive));
  const areas = computed<Area[]>(() => list.data.value ?? []);

  async function create(payload: NewAreaPayload): Promise<Area> {
    const area = await service.createArea(payload);
    await list.execute();
    return area;
  }

  async function update(id: number, payload: AreaPayload): Promise<Area> {
    const area = await service.updateArea(id, payload);
    await list.execute();
    return area;
  }

  return {
    areas,
    loading: list.loading,
    error: list.error,
    load: list.execute,
    create,
    update,
  };
}
