import sql from 'mssql';
import type { ProcedureParameter, ProcedureRunner } from '../../database/procedure-executor.js';
import {
  PRIORITY_VALUE,
  toAreaPerformance,
  toTask,
  toTaskNote,
  toTaskStatus,
  toTimelineEvent,
  type AreaPerformanceRow,
  type StatusCountRow,
  type TaskNoteRow,
  type TaskRow,
  type TaskStatusRow,
  type TimelineRow,
} from './task.mapper.js';
import type {
  AddTaskNoteInput,
  AreaPerformance,
  AreaPerformanceFilter,
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Task,
  TaskData,
  TaskPage,
  TaskRepository,
  TaskNote,
  TaskStatsFilter,
  TaskStatsSnapshot,
  TaskStatus,
  TimelineEvent,
  UpdateTaskInput,
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
        AreaId: optionalInt(filter.areaId),
        Search: { type: sql.NVarChar(100), value: filter.search ?? null },
        Priority: {
          type: sql.TinyInt,
          value: filter.priority ? PRIORITY_VALUE[filter.priority] : null,
        },
        Page: { type: sql.Int, value: filter.page },
        PageSize: { type: sql.Int, value: filter.pageSize },
        ViewerId: { type: sql.Int, value: filter.viewerId },
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
        AreaId: optionalInt(input.areaId),
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
        AreaId: optionalInt(input.areaId),
        ChangeArea: { type: sql.Bit, value: input.areaId !== undefined },
        ActorId: { type: sql.Int, value: input.actorId },
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
      },
    });
    return this.singleTask(rows, 'usp_Tasks_ChangeStatus');
  }

  async listStatuses(): Promise<TaskStatus[]> {
    const { rows } = await this.db.execute<TaskStatusRow>('dbo.usp_TaskStatuses_List');
    return rows.map(toTaskStatus);
  }

  async stats({ today, areaId, viewerId }: TaskStatsFilter): Promise<TaskStatsSnapshot> {
    const { rows, output } = await this.db.execute<StatusCountRow>('dbo.usp_Tasks_Stats', {
      inputs: {
        Today: dateOnly(today),
        ViewerId: { type: sql.Int, value: viewerId },
        AreaId: optionalInt(areaId),
      },
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

  async statsByArea({ today, days, viewerId }: AreaPerformanceFilter): Promise<AreaPerformance[]> {
    const { rows } = await this.db.execute<AreaPerformanceRow>('dbo.usp_Tasks_StatsByArea', {
      inputs: {
        Today: dateOnly(today),
        ViewerId: { type: sql.Int, value: viewerId },
        Days: { type: sql.Int, value: days },
      },
    });
    return rows.map(toAreaPerformance);
  }

  async addNote(input: AddTaskNoteInput): Promise<TaskNote> {
    const { rows } = await this.db.execute<TaskNoteRow>('dbo.usp_TaskNotes_Create', {
      inputs: {
        TaskId: { type: sql.Int, value: input.taskId },
        Body: { type: sql.NVarChar(2000), value: input.body },
        CreatedBy: { type: sql.Int, value: input.createdBy },
      },
    });
    const [row] = rows;
    if (!row) throw new Error('usp_TaskNotes_Create no devolvió el avance.');
    return toTaskNote(row);
  }

  async timeline(taskId: number, viewerId: number): Promise<TimelineEvent[]> {
    const { rows } = await this.db.execute<TimelineRow>('dbo.usp_Tasks_Timeline', {
      inputs: {
        TaskId: { type: sql.Int, value: taskId },
        ViewerId: { type: sql.Int, value: viewerId },
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
