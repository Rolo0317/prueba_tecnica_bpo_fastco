import type { PriorityCode, Task, TaskNote, TaskStatus, TimelineEvent } from './task.types.js';

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
  AssignedToId: number | null;
  AssignedToName: string | null;
  AreaId: number | null;
  AreaName: string | null;
  NotesCount: number;
  CreatedAt: Date;
  UpdatedAt: Date;
}

export interface StatusCountRow {
  Code: string;
  Name: string;
  IsFinal: boolean;
  TaskCount: number;
}

export interface TaskStatusRow {
  Code: string;
  Name: string;
  IsFinal: boolean;
  AllowedTransitions: string;
}

/** Prioridad: la BD guarda 1/2/3; la API expone códigos legibles. */
const PRIORITY_BY_VALUE: Readonly<Record<number, PriorityCode>> = {
  1: 'HIGH',
  2: 'MEDIUM',
  3: 'LOW',
};

export const PRIORITY_VALUE: Readonly<Record<PriorityCode, number>> = {
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

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
    assignedTo:
      row.AssignedToId === null ? null : { id: row.AssignedToId, name: row.AssignedToName ?? '' },
    area: row.AreaId === null ? null : { id: row.AreaId, name: row.AreaName ?? '' },
    notesCount: row.NotesCount,
    createdAt: row.CreatedAt.toISOString(),
    updatedAt: row.UpdatedAt.toISOString(),
  };
}

export interface TaskNoteRow {
  /** BIGINT: el driver lo entrega como texto para no perder precisión. */
  NoteId: string;
  Body: string;
  AuthorId: number;
  AuthorName: string;
  CreatedAt: Date;
}

export function toTaskNote(row: TaskNoteRow): TaskNote {
  return {
    id: Number(row.NoteId),
    body: row.Body,
    author: { id: row.AuthorId, name: row.AuthorName },
    createdAt: row.CreatedAt.toISOString(),
  };
}

/** Fila de usp_Tasks_Timeline: un evento con columnas que se llenan según su tipo. */
export interface TimelineRow {
  Kind: 'CREATED' | 'STATUS' | 'ASSIGNMENT' | 'NOTE';
  /** BIGINT (texto): ids de historial y avances. */
  EventId: string;
  OccurredAt: Date;
  ActorId: number;
  ActorName: string;
  FromCode: string | null;
  FromName: string | null;
  ToCode: string | null;
  ToName: string | null;
  FromUserName: string | null;
  ToUserName: string | null;
  Body: string | null;
}

export function toTimelineEvent(row: TimelineRow): TimelineEvent {
  const base = {
    // El id combina tipo y origen: cada fuente (historial, notas…) tiene su propia secuencia.
    id: `${row.Kind}-${row.EventId}`,
    occurredAt: row.OccurredAt.toISOString(),
    actor: { id: row.ActorId, name: row.ActorName },
  };
  const to = { code: row.ToCode ?? '', name: row.ToName ?? '' };

  switch (row.Kind) {
    case 'CREATED':
      return { ...base, kind: 'CREATED', status: to };
    case 'STATUS':
      return {
        ...base,
        kind: 'STATUS',
        from: { code: row.FromCode ?? '', name: row.FromName ?? '' },
        to,
      };
    case 'ASSIGNMENT':
      return { ...base, kind: 'ASSIGNMENT', fromUser: row.FromUserName, toUser: row.ToUserName };
    case 'NOTE':
      return { ...base, kind: 'NOTE', body: row.Body ?? '' };
  }
}

export function toTaskStatus(row: TaskStatusRow): TaskStatus {
  return {
    code: row.Code,
    name: row.Name,
    isFinal: row.IsFinal,
    allowedTransitions: row.AllowedTransitions ? row.AllowedTransitions.split(',') : [],
  };
}
