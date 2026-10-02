import { http, type ApiClient } from '@/core/http';
import type {
  CreateTaskPayload,
  Paginated,
  Task,
  TaskFilters,
  AreaPerformance,
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
  stats(today: string, areaId?: number | null): Promise<TaskStats>;
  statsByArea(today: string, days: number): Promise<AreaPerformance[]>;
  timeline(taskId: number): Promise<TimelineEvent[]>;
  addNote(taskId: number, body: string): Promise<TaskNote>;
}

export function createTaskService(client: ApiClient): TaskService {
  return {
    list: ({ status, areaId, search, priority, page, pageSize }) =>
      client.get<Paginated<Task>>('/tasks', { status, areaId, search, priority, page, pageSize }),
    create: (payload) => client.post<Task>('/tasks', payload),
    update: (taskId, payload) => client.patch<Task>(`/tasks/${String(taskId)}`, payload),
    changeStatus: (taskId, status) =>
      client.patch<Task>(`/tasks/${String(taskId)}/status`, { status }),
    listStatuses: () => client.get<TaskStatus[]>('/task-statuses'),
    stats: (today, areaId) => client.get<TaskStats>('/tasks/stats', { today, areaId }),
    statsByArea: (today, days) =>
      client.get<AreaPerformance[]>('/tasks/stats/by-area', { today, days }),
    timeline: (taskId) => client.get<TimelineEvent[]>(`/tasks/${String(taskId)}/timeline`),
    addNote: (taskId, body) => client.post<TaskNote>(`/tasks/${String(taskId)}/notes`, { body }),
  };
}

export const taskService = createTaskService(http);
