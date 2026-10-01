import { http, type ApiClient } from '@/core/http';
import type { CreateTaskPayload, Paginated, Task, TaskFilters, TaskStatus } from '../types';

export interface TaskService {
  list(filters: TaskFilters): Promise<Paginated<Task>>;
  create(payload: CreateTaskPayload): Promise<Task>;
  changeStatus(taskId: number, status: string): Promise<Task>;
  listStatuses(): Promise<TaskStatus[]>;
}

export function createTaskService(client: ApiClient): TaskService {
  return {
    list: ({ status, page, pageSize }) =>
      client.get<Paginated<Task>>('/tasks', { status, page, pageSize }),
    create: (payload) => client.post<Task>('/tasks', payload),
    changeStatus: (taskId, status) =>
      client.patch<Task>(`/tasks/${String(taskId)}/status`, { status }),
    listStatuses: () => client.get<TaskStatus[]>('/task-statuses'),
  };
}

export const taskService = createTaskService(http);
