import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Paginated,
  Task,
  TaskRepository,
  TaskStatus,
} from './task.types.js';

/**
 * Casos de uso de tareas. Las reglas de integridad (transiciones permitidas, existencia,
 * historial) viven en los Stored Procedures; aquí se orquesta y se arma la respuesta.
 */
export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  async list(filter: ListTasksFilter): Promise<Paginated<Task>> {
    const { tasks, total } = await this.tasks.list(filter);
    return {
      data: tasks,
      pagination: {
        page: filter.page,
        pageSize: filter.pageSize,
        total,
        totalPages: Math.ceil(total / filter.pageSize),
      },
    };
  }

  create(input: CreateTaskInput): Promise<Task> {
    return this.tasks.create(input);
  }

  changeStatus(input: ChangeTaskStatusInput): Promise<Task> {
    return this.tasks.changeStatus(input);
  }

  listStatuses(): Promise<TaskStatus[]> {
    return this.tasks.listStatuses();
  }
}
