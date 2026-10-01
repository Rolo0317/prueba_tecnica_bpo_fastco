import sql from 'mssql';
import type { ProcedureParameter, ProcedureRunner } from '../../database/procedure-executor.js';
import {
  PRIORITY_VALUE,
  toTask,
  toTaskNote,
  toTaskStatus,
  toTimelineEvent,
  type StatusCountRow,
  type TaskNoteRow,
  type TaskRow,
  type TaskStatusRow,
  type TimelineRow,
} from './task.mapper.js';
import type {
  AddTaskNoteInput,
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Task,
  TaskData,
  TaskPage,
  TaskRepository,
  TaskNote,
  TaskStatsSnapshot,
  TaskStatus,
  TimelineEvent,
  UpdateTaskInput,
  ViewerScope,
} from './task.types.js';

const optionalInt = (value: number | null | undefined): ProcedureParameter => ({
  type: sql.Int,
  value: value ?? null,
});

const dateOnly = (value: string | null): ProcedureParameter => ({
  type: sql.Date,
  value: value ? new Date(value) : null,
});

/** Campos editables de una tarea, comunes a crear y editar (DRY). */
const taskDataInputs = (data: TaskData): Record<string, ProcedureParameter> => ({
  Title: { type: sql.NVarChar(500), value: data.title },
  Description: { type: sql.NVarChar(2000), value: data.description },
  Priority: { type: sql.TinyInt, value: PRIORITY_VALUE[data.priority] },
  DueDate: dateOnly(data.dueDate),
});

export class SqlTaskRepository implements TaskRepository {
  constructor(private readonly db: ProcedureRunner) {}

  async list(filter: ListTasksFilter): Promise<TaskPage> {
    const { rows, output } = await this.db.execute<TaskRow>('dbo.usp_Tasks_List', {
      inputs: {
        StatusCode: { type: sql.VarChar(20), value: filter.status ?? null },
        Page: { type: sql.Int, value: filter.page },
        PageSize: { type: sql.Int, value: filter.pageSize },
        ViewerId: optionalInt(filter.viewerId),
      },
      outputs: { TotalCount: sql.Int },
    });
    return { tasks: rows.map(toTask), total: Number(output.TotalCount ?? 0) };
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const { rows } = await this.db.execute<TaskRow>('dbo.usp_Tasks_Create', {
      inputs: {
        ...taskDataInputs(input),
        AssignedTo: optionalInt(input.assignedTo),
        CreatedBy: { type: sql.Int, value: input.createdBy },
      },
    });
    return this.singleTask(rows, 'usp_Tasks_Create');
  }

  async update(input: UpdateTaskInput): Promise<Task> {
    const { rows } = await this.db.execute<TaskRow>('dbo.usp_Tasks_Update', {
      inputs: {
        TaskId: { type: sql.Int, value: input.taskId },
        ...taskDataInputs(input),
        AssignedTo: optionalInt(input.assignedTo),
        ChangeAssignee: { type: sql.Bit, value: input.assignedTo !== undefined },
        ActorId: optionalInt(input.actorId),
        ChangedBy: { type: sql.Int, value: input.changedBy },
      },
    });
    return this.singleTask(rows, 'usp_Tasks_Update');
  }

  async changeStatus(input: ChangeTaskStatusInput): Promise<Task> {
    const { rows } = await this.db.execute<TaskRow>('dbo.usp_Tasks_ChangeStatus', {
      inputs: {
        TaskId: { type: sql.Int, value: input.taskId },
        StatusCode: { type: sql.VarChar(20), value: input.status },
        ChangedBy: { type: sql.Int, value: input.changedBy },
        ViewerId: optionalInt(input.viewerId),
      },
    });
    return this.singleTask(rows, 'usp_Tasks_ChangeStatus');
  }

  async listStatuses(): Promise<TaskStatus[]> {
    const { rows } = await this.db.execute<TaskStatusRow>('dbo.usp_TaskStatuses_List');
    return rows.map(toTaskStatus);
  }

  async stats(today: string | null, viewerId?: ViewerScope): Promise<TaskStatsSnapshot> {
    const { rows, output } = await this.db.execute<StatusCountRow>('dbo.usp_Tasks_Stats', {
      inputs: { Today: dateOnly(today), ViewerId: optionalInt(viewerId) },
      outputs: {
        Total: sql.Int,
        Overdue: sql.Int,
        DueToday: sql.Int,
        HighPriorityOpen: sql.Int,
      },
    });
    return {
      total: Number(output.Total ?? 0),
      overdue: Number(output.Overdue ?? 0),
      dueToday: Number(output.DueToday ?? 0),
      highPriorityOpen: Number(output.HighPriorityOpen ?? 0),
      byStatus: rows.map((row) => ({
        code: row.Code,
        name: row.Name,
        isFinal: row.IsFinal,
        count: row.TaskCount,
      })),
    };
  }

  async addNote(input: AddTaskNoteInput): Promise<TaskNote> {
    const { rows } = await this.db.execute<TaskNoteRow>('dbo.usp_TaskNotes_Create', {
      inputs: {
        TaskId: { type: sql.Int, value: input.taskId },
        Body: { type: sql.NVarChar(2000), value: input.body },
        CreatedBy: { type: sql.Int, value: input.createdBy },
        ViewerId: optionalInt(input.viewerId),
      },
    });
    const [row] = rows;
    if (!row) throw new Error('usp_TaskNotes_Create no devolvió el avance.');
    return toTaskNote(row);
  }

  async timeline(taskId: number, viewerId: ViewerScope): Promise<TimelineEvent[]> {
    const { rows } = await this.db.execute<TimelineRow>('dbo.usp_Tasks_Timeline', {
      inputs: {
        TaskId: { type: sql.Int, value: taskId },
        ViewerId: optionalInt(viewerId),
      },
    });
    return rows.map(toTimelineEvent);
  }

  private singleTask(rows: TaskRow[], procedure: string): Task {
    const [row] = rows;
    if (!row) {
      throw new Error(`${procedure} no devolvió la tarea.`);
    }
    return toTask(row);
  }
}
