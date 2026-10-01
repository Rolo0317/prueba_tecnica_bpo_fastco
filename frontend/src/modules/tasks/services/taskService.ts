import { http, type ApiClient } from '@/core/http';
import type {
  CreateTaskPayload,
  Paginated,
  Task,
  TaskFilters,
  TaskNote,
  TaskStats,
  TaskStatus,
  TimelineEvent,
  UpdateTaskPayload,
} from '../types';

export interface TaskService {
  list(filters: TaskFilters): Promise<Paginated<Task>>;
  create(payload: CreateTaskPayload): Promise<Task>;
  update(taskId: number, payload: UpdateTaskPayload): Promise<Task>;
  changeStatus(taskId: number, status: string): Promise<Task>;
  listStatuses(): Promise<TaskStatus[]>;
  stats(today: string): Promise<TaskStats>;
  timeline(taskId: number): Promise<TimelineEvent[]>;
  addNote(taskId: number, body: string): Promise<TaskNote>;
}

export function createTaskService(client: ApiClient): TaskService {
  return {
    list: ({ status, page, pageSize }) =>
      client.get<Paginated<Task>>('/tasks', { status, page, pageSize }),
    create: (payload) => client.post<Task>('/tasks', payload),
    update: (taskId, payload) => client.patch<Task>(`/tasks/${String(taskId)}`, payload),
    changeStatus: (taskId, status) =>
      client.patch<Task>(`/tasks/${String(taskId)}/status`, { status }),
    listStatuses: () => client.get<TaskStatus[]>('/task-statuses'),
    stats: (today) => client.get<TaskStats>('/tasks/stats', { today }),
    timeline: (taskId) => client.get<TimelineEvent[]>(`/tasks/${String(taskId)}/timeline`),
    addNote: (taskId, body) => client.post<TaskNote>(`/tasks/${String(taskId)}/notes`, { body }),
  };
}

export const taskService = createTaskService(http);
