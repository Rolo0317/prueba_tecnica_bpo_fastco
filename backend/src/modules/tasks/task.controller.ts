import type { RequestHandler } from 'express';
import { requireAuthUser } from '../../middlewares/authenticate.js';
import type { ValidatedHandler } from '../../middlewares/validate.js';
import type {
  changeTaskStatusSchemas,
  createTaskSchemas,
  listTasksSchemas,
} from './task.schemas.js';
import type { TaskService } from './task.service.js';

export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  list: ValidatedHandler<typeof listTasksSchemas> = async ({ query }, _req, res) => {
    res.status(200).json(await this.taskService.list(query));
  };

  create: ValidatedHandler<typeof createTaskSchemas> = async ({ body }, req, res) => {
    const task = await this.taskService.create({ ...body, createdBy: requireAuthUser(req).id });
    res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
  };

  changeStatus: ValidatedHandler<typeof changeTaskStatusSchemas> = async (
    { params, body },
    req,
    res,
  ) => {
    const task = await this.taskService.changeStatus({
      taskId: params.id,
      status: body.status,
      changedBy: requireAuthUser(req).id,
    });
    res.status(200).json(task);
  };

  listStatuses: RequestHandler = async (_req, res) => {
    res.status(200).json(await this.taskService.listStatuses());
  };
}
