import { computed, ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';
import { toApiError } from '@/core/http';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../constants';
import { taskService, type TaskService } from '../services/taskService';
import { emptyPagination } from '@/shared/types/pagination';
import type { CreateTaskPayload, Priority, Task, TaskFilters, UpdateTaskPayload } from '../types';

const STATUS_PATTERN = /^[A-Z_]{1,20}$/;
const PRIORITIES: readonly Priority[] = ['HIGH', 'MEDIUM', 'LOW'];
const isPriority = (value: string | null): value is Priority =>
  value !== null && (PRIORITIES as readonly string[]).includes(value);

const firstValue = (value: LocationQuery[string] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/**
 * Los filtros viven en la URL (?status=&areaId=&priority=&q=&page=&pageSize=): se pueden
 * compartir y sobreviven al recargar.
 */
export function parseFilters(query: LocationQuery): TaskFilters {
  const status = firstValue(query.status);
  const areaId = Number(firstValue(query.areaId));
  const search = firstValue(query.q)?.trim().slice(0, 100) ?? '';
  const priority = firstValue(query.priority);
  const page = Number(firstValue(query.page));
  const pageSize = Number(firstValue(query.pageSize));

  return {
    status: status && STATUS_PATTERN.test(status) ? status : null,
    areaId: Number.isInteger(areaId) && areaId >= 1 ? areaId : null,
    search: search || null,
    priority: isPriority(priority) ? priority : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  };
}

/** ViewModel del listado: carga, filtro, paginación, creación y cambio de estado. */
export function useTasks(service: TaskService = taskService) {
  const route = useRoute();
  const router = useRouter();

  const filters = computed(() => parseFilters(route.query));
  const list = useAsyncState((current: TaskFilters) => service.list(current));
  const updatingTaskId = ref<number | null>(null);

  const tasks = computed<Task[]>(() => list.data.value?.data ?? []);
  const pagination = computed(() => list.data.value?.pagination ?? emptyPagination());

  const reload = () => list.execute(filters.value);
  watch(filters, reload, { immediate: true, deep: true });

  function updateQuery(changes: Partial<TaskFilters>): Promise<unknown> {
    const next = { ...filters.value, ...changes };
    return router.replace({
      query: {
        ...(next.status && { status: next.status }),
        ...(next.areaId !== null && { areaId: String(next.areaId) }),
        ...(next.priority && { priority: next.priority }),
        ...(next.search && { q: next.search }),
        ...(next.page > 1 && { page: String(next.page) }),
        ...(next.pageSize !== DEFAULT_PAGE_SIZE && { pageSize: String(next.pageSize) }),
      },
    });
  }

  const setStatus = (status: string | null) => updateQuery({ status, page: 1 });
  const setArea = (areaId: number | null) => updateQuery({ areaId, page: 1 });
  const setSearch = (search: string | null) =>
    updateQuery({ search: search?.trim() || null, page: 1 });
  const setPriority = (priority: Priority | null) => updateQuery({ priority, page: 1 });
  const clearFilters = () =>
    updateQuery({ status: null, areaId: null, search: null, priority: null, page: 1 });
  const setPage = (page: number) => updateQuery({ page });
  const setPageSize = (pageSize: number) => updateQuery({ pageSize, page: 1 });

  async function create(payload: CreateTaskPayload): Promise<Task> {
    const task = await service.create(payload);
    if (filters.value.page === 1) await reload();
    else await setPage(1);
    return task;
  }

  async function update(task: Task, payload: UpdateTaskPayload): Promise<Task> {
    const updated = await service.update(task.id, payload);
    replaceTask(updated);
    return updated;
  }

  /** Devuelve la tarea actualizada; si falla lanza ApiError (la vista muestra el mensaje). */
  async function changeStatus(task: Task, status: string): Promise<Task> {
    updatingTaskId.value = task.id;
    try {
      const updated = await service.changeStatus(task.id, status);
      // Con filtros activos, la tarea puede dejar de pertenecer a la vista: se recarga.
      if (filters.value.status || filters.value.priority) await reload();
      else replaceTask(updated);
      return updated;
    } catch (error) {
      throw toApiError(error);
    } finally {
      updatingTaskId.value = null;
    }
  }

  function replaceTask(updated: Task): void {
    const current = list.data.value;
    if (!current) return;
    list.data.value = {
      ...current,
      data: current.data.map((task) => (task.id === updated.id ? updated : task)),
    };
  }

  return {
    tasks,
    pagination,
    filters,
    loading: list.loading,
    error: list.error,
    updatingTaskId,
    reload,
    setStatus,
    setArea,
    clearFilters,
    setSearch,
    setPriority,
    setPage,
    setPageSize,
    create,
    update,
    changeStatus,
    replaceTask,
  };
}
