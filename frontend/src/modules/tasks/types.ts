export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: { code: string; name: string };
  priority: Priority;
  dueDate: string | null;
  createdBy: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface TaskStatus {
  code: string;
  name: string;
  isFinal: boolean;
  allowedTransitions: string[];
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
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
}
