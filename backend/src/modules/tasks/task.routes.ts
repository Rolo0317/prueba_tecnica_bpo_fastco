import { Router } from 'express';
import { withValidation } from '../../middlewares/validate.js';
import type { TaskController } from './task.controller.js';
import { changeTaskStatusSchemas, createTaskSchemas, listTasksSchemas } from './task.schemas.js';

export function createTaskRouter(controller: TaskController): Router {
  const router = Router();

  router.get('/', withValidation(listTasksSchemas, controller.list));
  router.post('/', withValidation(createTaskSchemas, controller.create));
  router.patch('/:id/status', withValidation(changeTaskStatusSchemas, controller.changeStatus));

  return router;
}

export function createTaskStatusRouter(controller: TaskController): Router {
  const router = Router();

  router.get('/', controller.listStatuses);

  return router;
}
