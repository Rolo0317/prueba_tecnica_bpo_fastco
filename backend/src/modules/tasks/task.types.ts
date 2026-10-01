export const PRIORITY_CODES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type PriorityCode = (typeof PRIORITY_CODES)[number];

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: { code: string; name: string };
  priority: PriorityCode;
  dueDate: string | null;
  createdBy: { id: number; name: string };
  /** Responsable de la tarea; null = sin asignar. */
  assignedTo: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStatus {
  code: string;
  name: string;
  isFinal: boolean;
  allowedTransitions: string[];
}

/**
 * Alcance de visibilidad que se envía a la BD:
 * null = administrador (todas las tareas); un id = agente (asignadas a él o creadas por él).
 */
export type ViewerScope = number | null;

export interface ListTasksFilter {
  status?: string | undefined;
  page: number;
  pageSize: number;
  viewerId?: ViewerScope;
}

export interface TaskPage {
  tasks: Task[];
  total: number;
}

export interface TaskData {
  title: string;
  description: string | null;
  priority: PriorityCode;
  dueDate: string | null;
}

export interface CreateTaskInput extends TaskData {
  assignedTo: number | null;
  createdBy: number;
}

export interface UpdateTaskInput extends TaskData {
  taskId: number;
  /** undefined = conservar el responsable actual. */
  assignedTo?: number | null;
  actorId: ViewerScope;
}

export interface ChangeTaskStatusInput {
  taskId: number;
  status: string;
  changedBy: number;
  viewerId?: ViewerScope;
}

export interface StatusCount {
  code: string;
  name: string;
  isFinal: boolean;
  count: number;
}

export interface TaskStatsSnapshot {
  total: number;
  overdue: number;
  dueToday: number;
  highPriorityOpen: number;
  byStatus: StatusCount[];
}

export interface TaskStats extends Omit<TaskStatsSnapshot, 'byStatus'> {
  byStatus: (StatusCount & { percentage: number })[];
}

export interface TaskRepository {
  list(filter: ListTasksFilter): Promise<TaskPage>;
  create(input: CreateTaskInput): Promise<Task>;
  update(input: UpdateTaskInput): Promise<Task>;
  changeStatus(input: ChangeTaskStatusInput): Promise<Task>;
  listStatuses(): Promise<TaskStatus[]>;
  stats(today: string | null, viewerId?: ViewerScope): Promise<TaskStatsSnapshot>;
}
