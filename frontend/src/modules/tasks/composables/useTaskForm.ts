import { computed, reactive, type Ref } from 'vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { todayIso } from '@/shared/utils/dates';
import { TASK_LIMITS } from '../constants';
import type { CreateTaskPayload, Priority, Task } from '../types';

interface TaskFormState {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  /** null = sin asignar. */
  assignedTo: number | null;
}

const initialState = (task: Task | null): TaskFormState => ({
  title: task?.title ?? '',
  description: task?.description ?? '',
  priority: task?.priority ?? 'MEDIUM',
  dueDate: task?.dueDate ?? '',
  assignedTo: task?.assignedTo?.id ?? null,
});

/** Mismas reglas que el backend, para dar feedback inmediato (el backend sigue validando). */
export const taskFormRules = {
  title: [
    (value: string) => value.trim().length > 0 || 'El título es obligatorio.',
    (value: string) =>
      value.trim().length <= TASK_LIMITS.title || `Máximo ${String(TASK_LIMITS.title)} caracteres.`,
  ],
  description: [
    (value: string) =>
      value.trim().length <= TASK_LIMITS.description ||
      `Máximo ${String(TASK_LIMITS.description)} caracteres.`,
  ],
  /** Al editar se permite conservar una fecha ya vencida; al crear no se acepta el pasado. */
  dueDate: (original: string | null) => [
    (value: string) =>
      !value ||
      value === original ||
      value >= todayIso() ||
      'La fecha límite no puede estar en el pasado.',
  ],
};

/** El responsable solo se envía cuando quien edita puede asignar (administrador). */
export function toPayload(state: TaskFormState, includeAssignee = false): CreateTaskPayload {
  return {
    title: state.title.trim(),
    description: state.description.trim() || null,
    priority: state.priority,
    dueDate: state.dueDate || null,
    ...(includeAssignee && { assignedTo: state.assignedTo }),
  };
}

export interface TaskFormActions {
  create: (payload: CreateTaskPayload) => Promise<Task>;
  update: (task: Task, payload: CreateTaskPayload) => Promise<Task>;
}

/** ViewModel del formulario de tarea. Sin tarea → creación; con tarea → edición. */
export function useTaskForm(
  task: Ref<Task | null>,
  actions: TaskFormActions,
  canAssign: Ref<boolean>,
) {
  const form = reactive<TaskFormState>(initialState(null));
  const isEdit = computed(() => task.value !== null);
  const dueDateRules = computed(() => taskFormRules.dueDate(task.value?.dueDate ?? null));

  const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(() => {
    const payload = toPayload(form, canAssign.value);
    return task.value ? actions.update(task.value, payload) : actions.create(payload);
  });

  function reset(): void {
    Object.assign(form, initialState(task.value));
    clearErrors();
  }

  return { form, isEdit, dueDateRules, loading, fieldErrors, generalError, reset, submit };
}
