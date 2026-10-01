import type { RequestHandler } from 'express';
import { requireAuthUser } from '../../middlewares/authenticate.js';
import type { ValidatedHandler } from '../../middlewares/validate.js';
import type {
  changeTaskStatusSchemas,
  createTaskSchemas,
  listTasksSchemas,
  taskStatsSchemas,
  updateTaskSchemas,
} from './task.schemas.js';
import type { TaskService } from './task.service.js';

export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  list: ValidatedHandler<typeof listTasksSchemas> = async ({ query }, req, res) => {
    res.status(200).json(await this.taskService.list(query, requireAuthUser(req)));
  };

  create: ValidatedHandler<typeof createTaskSchemas> = async ({ body }, req, res) => {
    const task = await this.taskService.create(body, requireAuthUser(req));
    res.status(201).location(`/api/v1/tasks/${task.id}`).json(task);
  };

  update: ValidatedHandler<typeof updateTaskSchemas> = async ({ params, body }, req, res) => {
    res.status(200).json(await this.taskService.update(params.id, body, requireAuthUser(req)));
  };

  changeStatus: ValidatedHandler<typeof changeTaskStatusSchemas> = async (
    { params, body },
    req,
    res,
  ) => {
    const task = await this.taskService.changeStatus(params.id, body.status, requireAuthUser(req));
    res.status(200).json(task);
  };

  stats: ValidatedHandler<typeof taskStatsSchemas> = async ({ query }, req, res) => {
    res.status(200).json(await this.taskService.stats(query.today, requireAuthUser(req)));
  };

  listStatuses: RequestHandler = async (_req, res) => {
    res.status(200).json(await this.taskService.listStatuses());
  };
}
