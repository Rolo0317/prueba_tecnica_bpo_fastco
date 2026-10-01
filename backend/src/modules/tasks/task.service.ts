import { ForbiddenError } from '../../core/errors.js';
import { toPaginated, type Paginated } from '../../core/pagination.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  ListTasksFilter,
  TaskNote,
  TimelineEvent,
  Task,
  TaskData,
  TaskRepository,
  TaskStats,
  TaskStatus,
  ViewerScope,
} from './task.types.js';

type TaskDataWithAssignee = TaskData & { assignedTo?: number | null | undefined };

/** Un administrador ve todo (null); un agente, solo lo asignado a él o creado por él. */
export const scopeOf = (viewer: AuthUser): ViewerScope =>
  viewer.role === 'ADMIN' ? null : viewer.id;

/**
 * Casos de uso de tareas. Las reglas de integridad y de visibilidad viven también en
 * los Stored Procedures (defensa en profundidad); aquí se decide el alcance de cada
 * rol y se arma la respuesta.
 */
export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  async list(
    filter: Omit<ListTasksFilter, 'viewerId'>,
    viewer: AuthUser,
  ): Promise<Paginated<Task>> {
    const { tasks, total } = await this.tasks.list({ ...filter, viewerId: scopeOf(viewer) });
    return toPaginated(tasks, total, filter.page, filter.pageSize);
  }

  /** Un administrador asigna a quien quiera; la tarea que crea un agente queda asignada a él. */
  async create({ assignedTo, ...fields }: TaskDataWithAssignee, viewer: AuthUser): Promise<Task> {
    const isAdmin = viewer.role === 'ADMIN';
    if (!isAdmin && assignedTo !== undefined && assignedTo !== viewer.id) {
      throw new ForbiddenError('Solo un administrador puede asignar tareas a otras personas.');
    }
    return this.tasks.create({
      ...fields,
      assignedTo: isAdmin ? (assignedTo ?? null) : viewer.id,
      createdBy: viewer.id,
    });
  }

  /** Un administrador edita cualquier tarea y la reasigna; un agente, solo las que creó. */
  async update(
    taskId: number,
    { assignedTo, ...fields }: TaskDataWithAssignee,
    viewer: AuthUser,
  ): Promise<Task> {
    if (viewer.role !== 'ADMIN' && assignedTo !== undefined) {
      throw new ForbiddenError('Solo un administrador puede cambiar el responsable.');
    }
    return this.tasks.update({
      ...fields,
      taskId,
      ...(assignedTo !== undefined && { assignedTo }),
      actorId: scopeOf(viewer),
      changedBy: viewer.id,
    });
  }

  /** Cualquier persona que pueda ver la tarea puede registrar un avance. */
  addNote(taskId: number, body: string, viewer: AuthUser): Promise<TaskNote> {
    return this.tasks.addNote({ taskId, body, createdBy: viewer.id, viewerId: scopeOf(viewer) });
  }

  timeline(taskId: number, viewer: AuthUser): Promise<TimelineEvent[]> {
    return this.tasks.timeline(taskId, scopeOf(viewer));
  }

  changeStatus(taskId: number, status: string, viewer: AuthUser): Promise<Task> {
    return this.tasks.changeStatus({
      taskId,
      status,
      changedBy: viewer.id,
      viewerId: scopeOf(viewer),
    });
  }

  listStatuses(): Promise<TaskStatus[]> {
    return this.tasks.listStatuses();
  }

  /** Indicadores del panel (dentro del alcance del usuario) con su porcentaje sobre el total. */
  async stats(today: string | null, viewer: AuthUser): Promise<TaskStats> {
    const snapshot = await this.tasks.stats(today, scopeOf(viewer));
    const percentageOf = (count: number) =>
      snapshot.total === 0 ? 0 : Math.round((count / snapshot.total) * 100);
    return {
      ...snapshot,
      byStatus: snapshot.byStatus.map((status) => ({
        ...status,
        percentage: percentageOf(status.count),
      })),
    };
  }
}
