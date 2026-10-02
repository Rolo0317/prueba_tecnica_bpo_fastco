import { ForbiddenError } from '../../core/errors.js';
import { toPaginated, type Paginated } from '../../core/pagination.js';
import { can } from '../access/access.types.js';
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
} from './task.types.js';

type TaskChanges = TaskData & {
  assignedTo?: number | null | undefined;
  areaId?: number | null | undefined;
};

/**
 * Casos de uso de tareas. Qué ve y qué puede hacer cada persona depende de los permisos
 * de su rol y de su área. Esas reglas se aplican aquí (respuesta temprana y clara) y
 * también en los Stored Procedures, que reciben siempre quién hace la operación
 * (defensa en profundidad).
 */
export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  async list(
    filter: Omit<ListTasksFilter, 'viewerId'>,
    viewer: AuthUser,
  ): Promise<Paginated<Task>> {
    const { tasks, total } = await this.tasks.list({ ...filter, viewerId: viewer.id });
    return toPaginated(tasks, total, filter.page, filter.pageSize);
  }

  /** Sin TASKS_ASSIGN, la tarea queda asignada a quien la crea. */
  async create({ assignedTo, areaId, ...fields }: TaskChanges, viewer: AuthUser): Promise<Task> {
    const canAssign = can(viewer, 'TASKS_ASSIGN');
    if (!canAssign && assignedTo !== undefined && assignedTo !== viewer.id) {
      throw new ForbiddenError('No tienes permiso para asignar tareas a otras personas.');
    }
    return this.tasks.create({
      ...fields,
      assignedTo: canAssign ? (assignedTo ?? null) : viewer.id,
      areaId: areaId ?? null,
      createdBy: viewer.id,
    });
  }

  /** Responsable y área solo cambian si vienen en la petición y hay permiso para ello. */
  async update(
    taskId: number,
    { assignedTo, areaId, ...fields }: TaskChanges,
    viewer: AuthUser,
  ): Promise<Task> {
    if (assignedTo !== undefined && !can(viewer, 'TASKS_ASSIGN')) {
      throw new ForbiddenError('No tienes permiso para cambiar el responsable.');
    }
    if (areaId !== undefined && !can(viewer, 'TASKS_VIEW_ALL')) {
      throw new ForbiddenError('No tienes permiso para mover tareas entre áreas.');
    }
    return this.tasks.update({
      ...fields,
      taskId,
      ...(assignedTo !== undefined && { assignedTo }),
      ...(areaId !== undefined && { areaId }),
      actorId: viewer.id,
    });
  }

  /** Cualquier persona que pueda ver la tarea puede registrar un avance. */
  addNote(taskId: number, body: string, viewer: AuthUser): Promise<TaskNote> {
    return this.tasks.addNote({ taskId, body, createdBy: viewer.id });
  }

  timeline(taskId: number, viewer: AuthUser): Promise<TimelineEvent[]> {
    return this.tasks.timeline(taskId, viewer.id);
  }

  changeStatus(taskId: number, status: string, viewer: AuthUser): Promise<Task> {
    return this.tasks.changeStatus({ taskId, status, changedBy: viewer.id });
  }

  listStatuses(): Promise<TaskStatus[]> {
    return this.tasks.listStatuses();
  }

  /** Indicadores del panel (dentro del alcance del usuario) con su porcentaje sobre el total. */
  async stats(
    { today, areaId }: { today: string | null; areaId?: number | undefined },
    viewer: AuthUser,
  ): Promise<TaskStats> {
    const snapshot = await this.tasks.stats({ today, areaId, viewerId: viewer.id });
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
