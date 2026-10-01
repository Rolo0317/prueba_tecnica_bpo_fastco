export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: { code: string; name: string };
  priority: Priority;
  dueDate: string | null;
  createdBy: { id: number; name: string };
  /** Responsable; null = sin asignar. */
  assignedTo: { id: number; name: string } | null;
  /** Cantidad de avances registrados en el seguimiento. */
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

export type { Paginated, Pagination } from '@/shared/types/pagination';

interface Person {
  id: number;
  name: string;
}

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

interface TimelineBase {
  id: string;
  occurredAt: string;
  actor: Person;
}

/** Evento del seguimiento de una tarea (mismo contrato que la API). */
export type TimelineEvent =
  | (TimelineBase & { kind: 'CREATED'; status: StatusRef })
  | (TimelineBase & { kind: 'STATUS'; from: StatusRef; to: StatusRef })
  | (TimelineBase & { kind: 'ASSIGNMENT'; fromUser: string | null; toUser: string | null })
  | (TimelineBase & { kind: 'NOTE'; body: string });

export interface StatusStat {
  code: string;
  name: string;
  isFinal: boolean;
  count: number;
  percentage: number;
}

export interface TaskStats {
  total: number;
  overdue: number;
  dueToday: number;
  highPriorityOpen: number;
  byStatus: StatusStat[];
}

export interface TaskFilters {
  status: string | null;
  page: number;
  pageSize: number;
}

export interface CreateTaskPayload {
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: string | null;
  /** Solo lo envía un administrador; ausente = conservar / valor por defecto. */
  assignedTo?: number | null;
}

export type UpdateTaskPayload = CreateTaskPayload;

export interface Assignee {
  id: number;
  username: string;
  fullName: string;
}
