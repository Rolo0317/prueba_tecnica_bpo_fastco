import type { NamedRef } from '../access/access.types.js';

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
  assignedTo: NamedRef | null;
  /** Área a la que pertenece; null = sin área. */
  area: NamedRef | null;
  /** Cantidad de avances registrados (seguimiento). */
  notesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStatus {
  code: string;
  name: string;
  isFinal: boolean;
  allowedTransitions: string[];
}

export interface ListTasksFilter {
  status?: string | undefined;
  /** Filtro opcional por área (dentro de lo que el usuario puede ver). */
  areaId?: number | undefined;
  /** Texto contenido en el título. */
  search?: string | undefined;
  priority?: PriorityCode | undefined;
  page: number;
  pageSize: number;
  /** Quién consulta: la BD limita el resultado según sus permisos. */
  viewerId: number;
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
  /** null = el área de quien crea (o sin área si puede ver todas). */
  areaId: number | null;
  createdBy: number;
}

export interface UpdateTaskInput extends TaskData {
  taskId: number;
  /** undefined = conservar el responsable actual. */
  assignedTo?: number | null;
  /** undefined = conservar el área actual. */
  areaId?: number | null;
  /** Quién edita (permisos y historial de responsables). */
  actorId: number;
}

type Person = NamedRef;

interface StatusRef {
  code: string;
  name: string;
}

export interface TaskNote {
  id: number;
  body: string;
  author: Person;
  createdAt: string;
}

export interface AddTaskNoteInput {
  taskId: number;
  body: string;
  createdBy: number;
}

interface TimelineBase {
  id: string;
  occurredAt: string;
  actor: Person;
}

/** Evento de la línea de tiempo de una tarea (unión discriminada por `kind`). */
export type TimelineEvent =
  | (TimelineBase & { kind: 'CREATED'; status: StatusRef })
  | (TimelineBase & { kind: 'STATUS'; from: StatusRef; to: StatusRef })
  | (TimelineBase & { kind: 'ASSIGNMENT'; fromUser: string | null; toUser: string | null })
  | (TimelineBase & { kind: 'NOTE'; body: string });

export interface ChangeTaskStatusInput {
  taskId: number;
  status: string;
  changedBy: number;
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

export interface TaskStatsFilter {
  today: string | null;
  areaId?: number | undefined;
  viewerId: number;
}

/** Indicadores de gestión de un área (null = tareas sin área). */
export interface AreaPerformance {
  area: NamedRef | null;
  open: number;
  overdue: number;
  /** Cerradas como completadas dentro del periodo. */
  closed: number;
  /** Promedio de horas desde la creación hasta completarse; null si no hubo cierres. */
  avgResolutionHours: number | null;
}

export interface AreaPerformanceFilter {
  today: string | null;
  days: number;
  viewerId: number;
}

export interface TaskRepository {
  list(filter: ListTasksFilter): Promise<TaskPage>;
  create(input: CreateTaskInput): Promise<Task>;
  update(input: UpdateTaskInput): Promise<Task>;
  changeStatus(input: ChangeTaskStatusInput): Promise<Task>;
  listStatuses(): Promise<TaskStatus[]>;
  stats(filter: TaskStatsFilter): Promise<TaskStatsSnapshot>;
  statsByArea(filter: AreaPerformanceFilter): Promise<AreaPerformance[]>;
  addNote(input: AddTaskNoteInput): Promise<TaskNote>;
  timeline(taskId: number, viewerId: number): Promise<TimelineEvent[]>;
}
