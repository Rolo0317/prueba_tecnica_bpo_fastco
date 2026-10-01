import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskEmptyState from '@/modules/tasks/components/TaskEmptyState.vue';
import TaskStatusChip from '@/modules/tasks/components/TaskStatusChip.vue';
import { useTaskForm, toPayload } from '@/modules/tasks/composables/useTaskForm';
import { useTaskStatuses } from '@/modules/tasks/composables/useTaskStatuses';
import { parseFilters, useTasks } from '@/modules/tasks/composables/useTasks';
import type { TaskService } from '@/modules/tasks/services/taskService';
import { ApiError } from '@/core/http';
import { buildTask, flushPromises, STATUSES, vuetify, withSetup } from '../helpers';

function fakeService(overrides: Partial<TaskService> = {}): TaskService {
  return {
    list: vi.fn().mockResolvedValue({
      data: [buildTask()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }),
    create: vi.fn().mockResolvedValue(buildTask({ id: 2 })),
    changeStatus: vi
      .fn()
      .mockResolvedValue(buildTask({ status: { code: 'IN_PROGRESS', name: 'En progreso' } })),
    listStatuses: vi.fn().mockResolvedValue(STATUSES),
    ...overrides,
  };
}

describe('parseFilters', () => {
  it('lee filtros válidos de la URL', () => {
    expect(parseFilters({ status: 'PENDING', page: '3', pageSize: '25' })).toEqual({
      status: 'PENDING',
      page: 3,
      pageSize: 25,
    });
  });

  it('ignora valores manipulados y usa valores por defecto', () => {
    expect(parseFilters({ status: "x'; DROP", page: '-4', pageSize: '9999' })).toEqual({
      status: null,
      page: 1,
      pageSize: 10,
    });
  });
});

describe('useTasks', () => {
  it('carga la lista según los filtros de la URL', async () => {
    const service = fakeService();
    const { result } = await withSetup(() => useTasks(service));
    await flushPromises();

    expect(service.list).toHaveBeenCalledWith({ status: null, page: 1, pageSize: 10 });
    expect(result.tasks.value).toHaveLength(1);
    expect(result.pagination.value.total).toBe(1);
  });

  it('al filtrar por estado vuelve a la página 1 y actualiza la URL', async () => {
    const service = fakeService();
    const { result, router } = await withSetup(() => useTasks(service));
    await result.setPage(3);

    await result.setStatus('COMPLETED');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ status: 'COMPLETED' });
    expect(service.list).toHaveBeenLastCalledWith({ status: 'COMPLETED', page: 1, pageSize: 10 });
  });

  it('expone el error de carga para mostrarlo con opción de reintentar', async () => {
    const service = fakeService({
      list: vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión')),
    });
    const { result } = await withSetup(() => useTasks(service));
    await flushPromises();

    expect(result.error.value?.message).toBe('Sin conexión');
    expect(result.loading.value).toBe(false);
  });

  it('cambia el estado y reemplaza la tarea en la lista sin recargar', async () => {
    const service = fakeService();
    const { result } = await withSetup(() => useTasks(service));
    await flushPromises();

    await result.changeStatus(buildTask(), 'IN_PROGRESS');

    expect(service.changeStatus).toHaveBeenCalledWith(1, 'IN_PROGRESS');
    expect(result.tasks.value[0]?.status.code).toBe('IN_PROGRESS');
    expect(result.updatingTaskId.value).toBeNull();
  });

  it('propaga un 409 de transición inválida como ApiError', async () => {
    const conflict = new ApiError(409, 'CONFLICT', 'No se permite');
    const service = fakeService({ changeStatus: vi.fn().mockRejectedValue(conflict) });
    const { result } = await withSetup(() => useTasks(service));

    await expect(result.changeStatus(buildTask(), 'PENDING')).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('useTaskStatuses', () => {
  it('solo ofrece las transiciones permitidas por el catálogo', async () => {
    const statuses = useTaskStatuses(fakeService());
    await statuses.load();

    expect(statuses.transitionsFor('PENDING').map((s) => s.code)).toEqual([
      'IN_PROGRESS',
      'CANCELLED',
    ]);
    expect(statuses.transitionsFor('COMPLETED')).toEqual([]);
  });
});

describe('useTaskForm', () => {
  it('limpia la entrada antes de enviarla', () => {
    expect(
      toPayload({ title: '  Escalar  ', description: '   ', priority: 'HIGH', dueDate: '' }),
    ).toEqual({
      title: 'Escalar',
      description: null,
      priority: 'HIGH',
      dueDate: null,
    });
  });

  it('asocia los errores de validación del servidor a cada campo', async () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Inválido', [
      { field: 'title', message: 'Muy largo' },
    ]);
    const form = useTaskForm(vi.fn().mockRejectedValue(error));

    await form.submit();

    expect(form.fieldErrors.value.title).toBe('Muy largo');
    expect(form.generalError.value).toBeNull();
  });
});

describe('Componentes', () => {
  it('TaskStatusChip muestra texto además del color (accesibilidad)', () => {
    const wrapper = mount(TaskStatusChip, {
      props: { code: 'COMPLETED', name: 'Completada' },
      global: { plugins: [vuetify] },
    });

    expect(wrapper.text()).toContain('Completada');
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('TaskEmptyState ofrece limpiar el filtro cuando hay uno activo', async () => {
    const wrapper = mount(TaskEmptyState, {
      props: { filtered: true },
      global: { plugins: [vuetify] },
    });

    expect(wrapper.text()).toContain('No hay tareas en este estado');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('clear-filter')).toHaveLength(1);
  });
});
