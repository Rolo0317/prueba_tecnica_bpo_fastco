import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import TaskEmptyState from '@/modules/tasks/components/TaskEmptyState.vue';
import TaskStatusChip from '@/modules/tasks/components/TaskStatusChip.vue';
import { taskFormRules, toPayload, useTaskForm } from '@/modules/tasks/composables/useTaskForm';
import { useTaskStatuses } from '@/modules/tasks/composables/useTaskStatuses';
import { parseFilters, useTasks } from '@/modules/tasks/composables/useTasks';
import type { TaskService } from '@/modules/tasks/services/taskService';
import type { Task } from '@/modules/tasks/types';
import { ApiError } from '@/core/http';
import { buildTask, flushPromises, STATS, STATUSES, vuetify, withSetup } from '../helpers';

function fakeService(overrides: Partial<TaskService> = {}): TaskService {
  return {
    list: vi.fn().mockResolvedValue({
      data: [buildTask()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }),
    create: vi.fn().mockResolvedValue(buildTask({ id: 2 })),
    update: vi.fn().mockResolvedValue(buildTask({ title: 'Editada' })),
    changeStatus: vi
      .fn()
      .mockResolvedValue(buildTask({ status: { code: 'IN_PROGRESS', name: 'En progreso' } })),
    listStatuses: vi.fn().mockResolvedValue(STATUSES),
    stats: vi.fn().mockResolvedValue(STATS),
    timeline: vi.fn().mockResolvedValue([]),
    addNote: vi.fn(),
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

  it('editar reemplaza la tarea en la lista con la respuesta del servidor', async () => {
    const service = fakeService();
    const { result } = await withSetup(() => useTasks(service));
    await flushPromises();

    await result.update(buildTask(), {
      title: 'Editada',
      description: null,
      priority: 'LOW',
      dueDate: null,
    });

    expect(service.update).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Editada' }));
    expect(result.tasks.value[0]?.title).toBe('Editada');
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
  const state = {
    title: '  Escalar  ',
    description: '   ',
    priority: 'HIGH' as const,
    dueDate: '',
    assignedTo: 7,
  };

  it('limpia la entrada y solo envía el responsable si quien edita puede asignar', () => {
    const base = { title: 'Escalar', description: null, priority: 'HIGH', dueDate: null };

    expect(toPayload(state)).toEqual(base);
    expect(toPayload(state, true)).toEqual({ ...base, assignedTo: 7 });
  });

  it('sin tarea crea; con tarea edita y precarga sus datos (incluido el responsable)', async () => {
    const actions = {
      create: vi.fn().mockResolvedValue(buildTask()),
      update: vi.fn().mockResolvedValue(buildTask()),
    };
    const task = ref<Task | null>(null);
    const form = useTaskForm(task, actions, ref(true));

    Object.assign(form.form, { title: 'Nueva', assignedTo: 3 });
    await form.submit();
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nueva', assignedTo: 3 }),
    );

    task.value = buildTask({ title: 'Existente', assignedTo: { id: 5, name: 'Ana' } });
    form.reset();
    expect(form.form).toMatchObject({ title: 'Existente', assignedTo: 5 });
    await form.submit();
    expect(actions.update).toHaveBeenCalledWith(
      task.value,
      expect.objectContaining({ assignedTo: 5 }),
    );
  });

  it('asocia los errores de validación del servidor a cada campo', async () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Inválido', [
      { field: 'title', message: 'Muy largo' },
    ]);
    const form = useTaskForm(
      ref(null),
      { create: vi.fn().mockRejectedValue(error), update: vi.fn() },
      ref(false),
    );

    await form.submit();

    expect(form.fieldErrors.value.title).toBe('Muy largo');
    expect(form.generalError.value).toBeNull();
  });

  it('al editar permite conservar una fecha límite ya vencida', () => {
    const rules = taskFormRules.dueDate('2020-01-01');

    expect(rules[0]?.('2020-01-01')).toBe(true);
    expect(rules[0]?.('2020-01-02')).toBe('La fecha límite no puede estar en el pasado.');
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
