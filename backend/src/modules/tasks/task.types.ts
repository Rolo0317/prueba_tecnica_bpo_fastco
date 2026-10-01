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
  page: number;
  pageSize: number;
}

export interface TaskPage {
  tasks: Task[];
  total: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateTaskInput {
  title: string;
  description: string | null;
  priority: PriorityCode;
  dueDate: string | null;
  createdBy: number;
}

export interface ChangeTaskStatusInput {
  taskId: number;
  status: string;
  changedBy: number;
}

export interface TaskRepository {
  list(filter: ListTasksFilter): Promise<TaskPage>;
  create(input: CreateTaskInput): Promise<Task>;
  changeStatus(input: ChangeTaskStatusInput): Promise<Task>;
  listStatuses(): Promise<TaskStatus[]>;
}
