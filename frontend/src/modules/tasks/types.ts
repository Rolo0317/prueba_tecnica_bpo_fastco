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
