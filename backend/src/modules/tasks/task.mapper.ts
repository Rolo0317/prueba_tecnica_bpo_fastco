import type { PriorityCode, Task, TaskStatus } from './task.types.js';

/** Fila de dbo.vw_TaskDetails tal como la devuelven los Stored Procedures. */
export interface TaskRow {
  TaskId: number;
  Title: string;
  Description: string | null;
  StatusCode: string;
  StatusName: string;
  Priority: number;
  DueDate: Date | null;
  CreatedById: number;
  CreatedByName: string;
  CreatedAt: Date;
  UpdatedAt: Date;
}

export interface TaskStatusRow {
  Code: string;
  Name: string;
  IsFinal: boolean;
  AllowedTransitions: string;
}

/** Prioridad: la BD guarda 1/2/3; la API expone códigos legibles. */
const PRIORITY_BY_VALUE: Readonly<Record<number, PriorityCode>> = { 1: 'HIGH', 2: 'MEDIUM', 3: 'LOW' };

export const PRIORITY_VALUE: Readonly<Record<PriorityCode, number>> = { HIGH: 1, MEDIUM: 2, LOW: 3 };

const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

export function toTask(row: TaskRow): Task {
  return {
    id: row.TaskId,
    title: row.Title,
    description: row.Description,
    status: { code: row.StatusCode, name: row.StatusName },
    priority: PRIORITY_BY_VALUE[row.Priority] ?? 'MEDIUM',
    dueDate: row.DueDate ? toDateOnly(row.DueDate) : null,
    createdBy: { id: row.CreatedById, name: row.CreatedByName },
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
  };
}

export function toTaskStatus(row: TaskStatusRow): TaskStatus {
  return {
    code: row.Code,
    name: row.Name,
    isFinal: row.IsFinal,
    allowedTransitions: row.AllowedTransitions ? row.AllowedTransitions.split(',') : [],
  };
}
