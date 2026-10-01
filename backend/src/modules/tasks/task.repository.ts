import sql from 'mssql';
import type { ProcedureRunner } from '../../database/procedure-executor.js';
import {
  PRIORITY_VALUE,
  toTask,
  toTaskStatus,
  type TaskRow,
  type TaskStatusRow,
} from './task.mapper.js';
import type {
  ChangeTaskStatusInput,
  CreateTaskInput,
  ListTasksFilter,
  Task,
  TaskPage,
  TaskRepository,
  TaskStatus,
} from './task.types.js';

export class SqlTaskRepository implements TaskRepository {
  constructor(private readonly db: ProcedureRunner) {}

  async list(filter: ListTasksFilter): Promise<TaskPage> {
    const { rows, output } = await this.db.execute<TaskRow>('dbo.usp_Tasks_List', {
      inputs: {
        StatusCode: { type: sql.VarChar(20), value: filter.status ?? null },
        Page: { type: sql.Int, value: filter.page },
        PageSize: { type: sql.Int, value: filter.pageSize },
      },
      outputs: { TotalCount: sql.Int },
    });
    return { tasks: rows.map(toTask), total: Number(output.TotalCount ?? 0) };
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const { rows } = await this.db.execute<TaskRow>('dbo.usp_Tasks_Create', {
      inputs: {
        Title: { type: sql.NVarChar(500), value: input.title },
        Description: { type: sql.NVarChar(2000), value: input.description },
        Priority: { type: sql.TinyInt, value: PRIORITY_VALUE[input.priority] },
        DueDate: { type: sql.Date, value: input.dueDate ? new Date(input.dueDate) : null },
        CreatedBy: { type: sql.Int, value: input.createdBy },
      },
    });
    return this.singleTask(rows, 'usp_Tasks_Create');
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

  private singleTask(rows: TaskRow[], procedure: string): Task {
    const [row] = rows;
    if (!row) {
      throw new Error(`${procedure} no devolvió la tarea.`);
    }
    return toTask(row);
  }
}
