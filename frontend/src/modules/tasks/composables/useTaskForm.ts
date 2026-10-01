import { computed, reactive } from 'vue';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { todayIso } from '@/shared/utils/dates';
import { TASK_LIMITS } from '../constants';
import type { CreateTaskPayload, Priority, Task } from '../types';

interface TaskFormState {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
}

const initialState = (): TaskFormState => ({
  title: '',
  description: '',
  priority: 'MEDIUM',
  dueDate: '',
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
  dueDate: [
    (value: string) =>
      !value || value >= todayIso() || 'La fecha límite no puede estar en el pasado.',
  ],
};

export function toPayload(state: TaskFormState): CreateTaskPayload {
  return {
    title: state.title.trim(),
    description: state.description.trim() || null,
    priority: state.priority,
    dueDate: state.dueDate || null,
  };
}

/** ViewModel del formulario de creación: estado, envío y errores del servidor por campo. */
export function useTaskForm(submitTask: (payload: CreateTaskPayload) => Promise<Task>) {
  const form = reactive<TaskFormState>(initialState());
  const { loading, error, execute } = useAsyncState(() => submitTask(toPayload(form)));

  /** Errores de validación del backend asociados a cada campo (details del contrato de error). */
  const fieldErrors = computed<Partial<Record<keyof TaskFormState, string>>>(() =>
    Object.fromEntries(
      (error.value?.details ?? []).map((detail) => [detail.field, detail.message]),
    ),
  );
  const generalError = computed(() =>
    error.value && error.value.details.length === 0 ? error.value.message : null,
  );

  function reset(): void {
    Object.assign(form, initialState());
    error.value = null;
  }

  async function submit(): Promise<Task | undefined> {
    return execute();
  }

  return { form, loading, fieldErrors, generalError, reset, submit };
}
