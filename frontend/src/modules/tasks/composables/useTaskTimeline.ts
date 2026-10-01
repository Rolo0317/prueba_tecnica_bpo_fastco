import { ref } from 'vue';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { taskService, type TaskService } from '../services/taskService';
import type { TaskNote, TimelineEvent } from '../types';

/** ViewModel del seguimiento de una tarea: línea de tiempo y registro de avances. */
export function useTaskTimeline(service: Pick<TaskService, 'timeline' | 'addNote'> = taskService) {
  const taskId = ref<number | null>(null);
  const timeline = useAsyncState((id: number) => service.timeline(id));
  const note = useAsyncState((id: number, body: string) => service.addNote(id, body));

  /** Más recientes primero: lo último que pasó es lo que más importa al hacer seguimiento. */
  const events = ref<TimelineEvent[]>([]);

  async function load(id: number): Promise<void> {
    taskId.value = id;
    events.value = [];
    note.error.value = null;
    const result = await timeline.execute(id);
    if (result && taskId.value === id) events.value = [...result].reverse();
  }

  /** Registra el avance y lo muestra arriba sin recargar toda la línea de tiempo. */
  async function addNote(body: string): Promise<TaskNote | undefined> {
    if (taskId.value === null) return undefined;
    const created = await note.execute(taskId.value, body);
    if (created) {
      events.value = [
        {
          kind: 'NOTE',
          id: `NOTE-${String(created.id)}`,
          occurredAt: created.createdAt,
          actor: created.author,
          body: created.body,
        },
        ...events.value,
      ];
    }
    return created;
  }

  return {
    events,
    loading: timeline.loading,
    error: timeline.error,
    saving: note.loading,
    noteError: note.error,
    load,
    addNote,
  };
}
