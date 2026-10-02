import { computed, reactive, ref, toRef, watch } from 'vue';
import { useDebounced } from '@/shared/composables/useDebounced';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { DEFAULT_PAGE_SIZE, emptyPagination } from '@/shared/types/pagination';
import { userService, type UserService } from '../services/userService';
import type { ManagedUser, NewUserPayload, UpdateUserPayload, UserFilters } from '../types';

export const emptyUserFilters = (): UserFilters => ({
  search: '',
  roleId: null,
  areaId: null,
  status: null,
  pendingReset: false,
});

/**
 * ViewModel de la administración de usuarios: listado paginado con buscador (nombre,
 * usuario o correo) y filtros, y acciones sobre cada usuario.
 */
export function useUsers(service: UserService = userService) {
  const page = ref(1);
  const pageSize = ref<number>(DEFAULT_PAGE_SIZE);
  const busyUserId = ref<number | null>(null);
  const filters = reactive<UserFilters>(emptyUserFilters());
  // El texto se aplica cuando se deja de escribir; los selectores, de inmediato.
  const search = useDebounced(toRef(filters, 'search'));

  const list = useAsyncState(() =>
    service.list(page.value, pageSize.value, { ...filters, search: search.value }),
  );
  const users = computed<ManagedUser[]>(() => list.data.value?.data ?? []);
  const pagination = computed(() => list.data.value?.pagination ?? emptyPagination(pageSize.value));
  const hasFilters = computed(
    () =>
      filters.search.trim() !== '' ||
      filters.roleId !== null ||
      filters.areaId !== null ||
      filters.status !== null ||
      filters.pendingReset,
  );

  const reload = () => list.execute();
  watch([page, pageSize], reload, { immediate: true });
  watch(
    [
      search,
      () => filters.roleId,
      () => filters.areaId,
      () => filters.status,
      () => filters.pendingReset,
    ],
    () => {
      if (page.value === 1) void reload();
      else page.value = 1;
    },
  );

  function clearFilters(): void {
    Object.assign(filters, emptyUserFilters());
  }

  function setPage(value: number): void {
    page.value = value;
  }

  function setPageSize(value: number): void {
    pageSize.value = value;
    page.value = 1;
  }

  function replaceUser(updated: ManagedUser): void {
    const current = list.data.value;
    if (!current) return;
    list.data.value = {
      ...current,
      data: current.data.map((user) => (user.id === updated.id ? updated : user)),
    };
  }

  async function create(payload: NewUserPayload): Promise<ManagedUser> {
    const user = await service.create(payload);
    await reload();
    return user;
  }

  async function update(id: number, payload: UpdateUserPayload): Promise<ManagedUser> {
    const user = await service.update(id, payload);
    replaceUser(user);
    return user;
  }

  async function setActive(user: ManagedUser, isActive: boolean): Promise<ManagedUser> {
    busyUserId.value = user.id;
    try {
      const updated = await service.setActive(user.id, isActive);
      replaceUser(updated);
      return updated;
    } finally {
      busyUserId.value = null;
    }
  }

  /** Eliminación lógica; devuelve cuántas tareas abiertas quedaron sin asignar. */
  async function remove(user: ManagedUser): Promise<number> {
    busyUserId.value = user.id;
    try {
      const { unassignedTasks } = await service.remove(user.id);
      await reload();
      return unassignedTasks;
    } finally {
      busyUserId.value = null;
    }
  }

  async function resetPassword(id: number, newPassword: string): Promise<true> {
    await service.resetPassword(id, newPassword);
    await reload();
    return true;
  }

  return {
    users,
    pagination,
    filters,
    hasFilters,
    clearFilters,
    loading: list.loading,
    error: list.error,
    busyUserId,
    reload,
    setPage,
    setPageSize,
    create,
    update,
    setActive,
    remove,
    resetPassword,
  };
}
